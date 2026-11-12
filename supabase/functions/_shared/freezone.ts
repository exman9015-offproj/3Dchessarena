export class FreezoneFunctionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type FreezonePieceState = {
  id?: string;
  side?: number;
  type?: string;
  name?: string;
  title?: string;
  description?: string;
  catchphrase?: string;
  r?: number;
  c?: number;
  eliminations?: number;
  personality?: string;
  language?: string;
  aiVoice?: string;
  voiceLines?: Record<string, string>;
  freeVoiceLines?: Record<string, string>;
};

export type FreezoneStoredState = {
  config?: { gameMode?: string; boardSize?: number };
  seats: unknown[];
  pieces?: FreezonePieceState[];
  freezonePlayers?: Record<string, {
    controlledPieceId?: string;
    stepBudget?: number;
    stepsUsed?: number;
    movesPerCycle?: number;
    movesUsed?: number;
    cooldownUntil?: number;
    xp?: number;
    orbBalances?: Record<string, number>;
    upgradeLevels?: Record<string, number>;
  }>;
  aiDialogue?: {
    id?: string;
    lines?: Array<{ pieceId?: string; text?: string }>;
  };
  aiHistory?: Array<{
    pieceId?: string;
    name?: string;
    side?: number;
    text?: string;
    kind?: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new FreezoneFunctionError('Request is too large.', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new FreezoneFunctionError('Request is too large.', 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new FreezoneFunctionError('Request body must be valid JSON.');
  }
  if (!isRecord(body)) throw new FreezoneFunctionError('Request body must be a JSON object.');
  return body;
}

export async function authorizeFreezonePlayer(body: Record<string, unknown>) {
  const roomCode = typeof body.roomCode === 'string' ? body.roomCode.trim().toUpperCase() : '';
  const playerToken = typeof body.playerToken === 'string' ? body.playerToken : '';
  if (!/^[A-Z0-9]{4}$/.test(roomCode) || playerToken.length < 16 || playerToken.length > 256) {
    throw new FreezoneFunctionError('A valid Freezone room and player token are required.', 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    throw new FreezoneFunctionError('Freezone AI is not configured on the server.', 503);
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rooms?code=eq.${encodeURIComponent(roomCode)}&select=code,free_mode_state&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    }
  );
  if (!response.ok) throw new FreezoneFunctionError('Could not verify the Freezone room.', 502);
  const rows = await response.json() as Array<{ free_mode_state?: unknown }>;
  const stateData = Array.isArray(rows) ? rows[0]?.free_mode_state : null;
  if (!isRecord(stateData) || !isRecord(stateData.config) ||
      stateData.config.gameMode !== 'freezone' || !Array.isArray(stateData.seats)) {
    throw new FreezoneFunctionError('Freezone room was not found or is not active.', 404);
  }
  const state = stateData as unknown as FreezoneStoredState;
  const side = state.seats.findIndex((seat) => isRecord(seat) && seat.token === playerToken);
  if (side < 0 || side >= 10) {
    throw new FreezoneFunctionError('This player token does not own a seat in the room.', 403);
  }
  return { roomCode, playerToken, side, state };
}

export function limitedText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, maxLength);
}

export function errorResponse(error: unknown) {
  const status = error instanceof FreezoneFunctionError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'Freezone AI request failed.';
  return jsonResponse({ error: message }, status);
}
