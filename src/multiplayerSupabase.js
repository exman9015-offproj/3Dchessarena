import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        realtime: { params: { eventsPerSecond: 10 } }
      })
    : null;

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';

function requireClient() {
  if (!supabase) {
    throw new Error('Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.local.');
  }
  return supabase;
}

function throwIfError(error) {
  if (error) {
    throw new Error(error.message || 'Falha ao acessar o Supabase.');
  }
}

function hasPlayer(player) {
  return Boolean(player?.id && !String(player.id).startsWith('waiting-'));
}

function squareToCoords(square) {
  if (!/^[a-h][1-8]$/.test(square || '')) return null;
  return { r: 8 - Number(square[1]), c: FILES.indexOf(square[0]) };
}

function coordsToSquare(coords) {
  return `${FILES[coords.c]}${8 - coords.r}`;
}

function toGameRoom(room, rows) {
  const moves = rows.map((row, index) => {
    const from = squareToCoords(row.move_from);
    const to = squareToCoords(row.move_to);
    const promotion = row.move_san?.match(/[qrbn]$/i)?.[0]?.toLowerCase();
    return {
      seq: index + 1,
      color: row.player_color,
      from,
      to,
      promotion: promotion || 'queen'
    };
  }).filter((move) => move.from && move.to);

  return {
    ...room,
    whiteJoined: hasPlayer(room.white_player),
    blackJoined: hasPlayer(room.black_player),
    customJoined: Array.isArray(room.free_mode_state?.seats)
      ? room.free_mode_state.seats.filter((seat) => Boolean(seat?.token)).length
      : null,
    customCapacity: Array.isArray(room.free_mode_state?.seats)
      ? room.free_mode_state.seats.length
      : null,
    moves
  };
}

async function fetchRoom(code) {
  const client = requireClient();
  const { data, error } = await client
    .from('rooms')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  throwIfError(error);
  return data;
}

export async function fetchRoomState(code) {
  const client = requireClient();
  const room = await fetchRoom(code);
  if (!room) throw new Error('Sala não encontrada. Confira o código do convite.');

  const { data: rows, error } = await client
    .from('moves')
    .select('move_san, move_from, move_to, player_color, created_at, id')
    .eq('room_id', room.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  throwIfError(error);
  return toGameRoom(room, rows || []);
}

export async function listPublicRooms(limit = 40) {
  const client = requireClient();
  const { data, error } = await client
    .from('rooms')
    .select('id, code, status, updated_at, created_at, white_player, black_player, free_mode_state')
    .eq('is_public', true)
    .in('status', ['waiting', 'active'])
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.floor(limit) || 40)));
  throwIfError(error);

  return (data || []).map((room) => {
    const state = room.free_mode_state || {};
    const config = state.config || null;
    const seats = Array.isArray(state.seats) ? state.seats : null;
    const kind = config?.gameMode === 'freezone' ? 'freezone' : config ? 'custom' : 'chess';
    const joined = seats
      ? seats.filter((seat) => Boolean(seat?.token)).length
      : Number(hasPlayer(room.white_player)) + Number(hasPlayer(room.black_player));
    const capacity = seats?.length || (config?.playerCount || 2);
    return {
      id: room.id,
      code: room.code,
      status: room.status,
      updatedAt: room.updated_at,
      createdAt: room.created_at,
      kind,
      name: state.arenaName || config?.arenaName ||
        (kind === 'freezone' ? 'Freezone Arena' : kind === 'custom' ? 'Custom Chess Room' : 'Open Chess Match'),
      isMainArena: state.mainArena === true,
      joined,
      capacity
    };
  });
}

export async function createRoom({ preferredColor, playerToken, isPublic = false, freeModeState = null }) {
  const client = requireClient();
  const color = preferredColor === 'b' ? 'b' : 'w';
  const player = { id: playerToken, name: 'Player' };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const waitingPlayer = { id: `waiting-${code}`, name: 'Waiting for opponent' };
    const room = {
      code,
      is_public: isPublic,
      white_player: color === 'w' ? player : waitingPlayer,
      black_player: color === 'b' ? player : null,
      spectators: [],
      fen: INITIAL_FEN,
      pgn: '',
      status: 'waiting',
      turn: 'w',
      ...(freeModeState ? { free_mode_state: freeModeState } : {})
    };

    const { data, error } = await client.from('rooms').insert(room).select('*').single();
    if (!error) {
      return {
        ok: true,
        code,
        color,
        ...(freeModeState ? { playerIndex: 0 } : {}),
        playerToken,
        room: toGameRoom(data, [])
      };
    }
    if (error.code !== '23505') throwIfError(error);
  }

  throw new Error('Não foi possível gerar um código de sala único. Tente novamente.');
}

export async function findOrCreateQuickMatch(playerToken) {
  const client = requireClient();
  const { data: rooms, error } = await client
    .from('rooms')
    .select('*')
    .eq('is_public', true)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(20);
  throwIfError(error);

  for (const room of rooms || []) {
    if (room.white_player?.id === playerToken) {
      return {
        ok: true,
        code: room.code,
        color: 'w',
        playerToken,
        room: await fetchRoomState(room.code)
      };
    }
    if (room.black_player?.id === playerToken) {
      return {
        ok: true,
        code: room.code,
        color: 'b',
        playerToken,
        room: await fetchRoomState(room.code)
      };
    }
    if (room.free_mode_state?.config) continue;
    if (!hasPlayer(room.white_player) || !hasPlayer(room.black_player)) {
      const joined = await joinRoom(room.code, playerToken);
      if (joined.ok) return joined;
    }
  }

  return createRoom({
    preferredColor: Math.random() < 0.5 ? 'w' : 'b',
    playerToken,
    isPublic: true
  });
}

export async function joinRoom(code, playerToken) {
  const client = requireClient();
  let room = await fetchRoom(code);
  if (!room) return { ok: false, error: 'Sala não encontrada. Confira o código do convite.' };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const customSeats = room.free_mode_state?.config
      ? room.free_mode_state.seats || []
      : null;
    if (customSeats) {
      const existingSeat = customSeats.findIndex((seat) => seat?.token === playerToken);
      if (existingSeat >= 0) {
        return {
          ok: true,
          code,
          color: ['w', 'b', 'r', 'u', 'g', 'o', 'p', 'c', 'm', 'y'][existingSeat],
          playerIndex: existingSeat,
          playerToken,
          room: await fetchRoomState(code)
        };
      }
      const playerIndex = customSeats.findIndex((seat) => !seat?.token);
      if (playerIndex < 0) return { ok: false, error: 'Esta sala já está cheia.' };
      const nextSeats = customSeats.slice();
      nextSeats[playerIndex] = { token: playerToken, name: 'Player' };
      const freeModeState = { ...room.free_mode_state, seats: nextSeats };
      let update = client
        .from('rooms')
        .update({
          free_mode_state: freeModeState,
          ...(playerIndex === 1 ? { black_player: { id: playerToken, name: 'Player' } } : {}),
          status: nextSeats.every((seat) => Boolean(seat?.token)) ? 'active' : 'waiting',
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);
      if (room.updated_at) update = update.eq('updated_at', room.updated_at);
      const { data, error } = await update.select('*').maybeSingle();
      throwIfError(error);
      if (data) {
        return {
          ok: true,
          code,
          color: ['w', 'b', 'r', 'u', 'g', 'o', 'p', 'c', 'm', 'y'][playerIndex],
          playerIndex,
          playerToken,
          room: await fetchRoomState(code)
        };
      }
      room = await fetchRoom(code);
      if (!room) break;
      continue;
    }

    if (room.white_player?.id === playerToken) {
      return { ok: true, code, color: 'w', playerToken, room: await fetchRoomState(code) };
    }
    if (room.black_player?.id === playerToken) {
      return { ok: true, code, color: 'b', playerToken, room: await fetchRoomState(code) };
    }

    const player = { id: playerToken, name: 'Player' };
    let color;
    let update;
    if (!hasPlayer(room.white_player)) {
      color = 'w';
      update = client.from('rooms')
        .update({
          white_player: player,
          status: hasPlayer(room.black_player) ? 'active' : 'waiting',
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id)
        .filter('white_player->>id', 'eq', room.white_player?.id || '');
    } else if (!hasPlayer(room.black_player)) {
      color = 'b';
      update = client.from('rooms')
        .update({ black_player: player, status: 'active', updated_at: new Date().toISOString() })
        .eq('id', room.id)
        .is('black_player', null);
    } else {
      return { ok: false, error: 'Esta sala já está cheia.' };
    }

    const { data, error } = await update.select('*').maybeSingle();
    throwIfError(error);
    if (data) {
      return { ok: true, code, color, playerToken, room: await fetchRoomState(code) };
    }
    room = await fetchRoom(code);
    if (!room) break;
  }

  return { ok: false, error: 'Outro jogador entrou primeiro. Tente novamente.' };
}

export async function sendMove(code, playerToken, move) {
  const client = requireClient();
  const room = await fetchRoom(code);
  if (!room) throw new Error('A sala não existe mais.');
  if (room.turn !== move.color) throw new Error('A jogada não foi salva: não é a sua vez.');

  const player = move.color === 'w' ? room.white_player : room.black_player;
  if (player?.id !== playerToken) throw new Error('A jogada não foi salva: esta peça pertence ao outro jogador.');

  const from = coordsToSquare(move.from);
  const to = coordsToSquare(move.to);
  const suffix = move.promotion === 'queen' ? 'q' : '';
  const { error: moveError } = await client.from('moves').insert({
    room_id: room.id,
    move_san: `${from}${to}${suffix}`,
    move_from: from,
    move_to: to,
    piece: move.piece || 'piece',
    fen: room.fen || INITIAL_FEN,
    player_color: move.color
  });
  throwIfError(moveError);

  const { error: roomError } = await client
    .from('rooms')
    .update({
      turn: move.color === 'w' ? 'b' : 'w',
      updated_at: new Date().toISOString()
    })
    .eq('id', room.id);
  throwIfError(roomError);
}

export async function saveFreeModeState(code, state) {
  const client = requireClient();
  const room = await fetchRoom(code);
  if (!room) throw new Error('A sala não existe mais.');

  const { error } = await client
    .from('rooms')
    .update({
      free_mode_state: state,
      updated_at: new Date().toISOString()
    })
    .eq('id', room.id);
  throwIfError(error);
}

function mergeFreezoneRoomState(baseState, localState, currentState) {
  const base = baseState || {};
  const current = currentState || {};
  const basePieces = new Map((base.pieces || []).map((piece) => [piece.id, piece]));
  const localPieces = new Map((localState.pieces || []).map((piece) => [piece.id, piece]));
  const mergedPieces = new Map((current.pieces || []).map((piece) => [piece.id, piece]));

  for (const id of basePieces.keys()) {
    if (!localPieces.has(id)) mergedPieces.delete(id);
  }
  for (const [id, piece] of localPieces) {
    if (JSON.stringify(basePieces.get(id)) !== JSON.stringify(piece)) mergedPieces.set(id, piece);
  }

  const baseOrbs = new Map((base.xpOrbs || []).map((orb) => [orb.id, orb]));
  const localOrbs = new Map((localState.xpOrbs || []).map((orb) => [orb.id, orb]));
  const mergedOrbs = new Map((current.xpOrbs || []).map((orb) => [orb.id, orb]));
  for (const id of baseOrbs.keys()) {
    if (!localOrbs.has(id)) mergedOrbs.delete(id);
  }
  for (const [id, orb] of localOrbs) {
    if (JSON.stringify(baseOrbs.get(id)) !== JSON.stringify(orb)) mergedOrbs.set(id, orb);
  }

  const players = { ...(current.freezonePlayers || {}) };
  for (const [side, player] of Object.entries(localState.freezonePlayers || {})) {
    if (JSON.stringify(base.freezonePlayers?.[side]) !== JSON.stringify(player)) {
      players[side] = player;
    }
  }

  const occupied = new Set(
    Array.from(mergedPieces.values(), (piece) => `${piece.r},${piece.c}`)
  );
  const orbCells = new Set();
  const xpOrbs = Array.from(mergedOrbs.values()).filter((orb) => {
    const key = `${orb.r},${orb.c}`;
    if (occupied.has(key) || orbCells.has(key)) return false;
    orbCells.add(key);
    return true;
  });

  return {
    ...current,
    ...localState,
    seats: current.seats || localState.seats || [],
    freezonePlayers: players,
    pieces: Array.from(mergedPieces.values()),
    xpOrbs
  };
}

export async function saveFreezoneState(code, state, baseState) {
  if (state?.config?.gameMode !== 'freezone') {
    return saveFreeModeState(code, state);
  }

  const client = requireClient();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const room = await fetchRoom(code);
    if (!room) throw new Error('A sala Freezone não existe mais.');
    if (room.free_mode_state?.config?.gameMode !== 'freezone') {
      throw new Error('A sala deixou de ser uma arena Freezone; o estado não foi salvo.');
    }

    const current = room.free_mode_state;
    const merged = mergeFreezoneRoomState(baseState || current, state, current);
    let update = client.from('rooms')
      .update({
        free_mode_state: merged,
        updated_at: new Date(Math.max(
          Date.now(),
          (Date.parse(room.updated_at || '') || 0) + 1
        )).toISOString()
      })
      .eq('id', room.id);
    update = room.updated_at
      ? update.eq('updated_at', room.updated_at)
      : update.is('updated_at', null);
    const { data, error } = await update
      .select('id')
      .maybeSingle();
    throwIfError(error);
    if (data) return merged;
  }

  throw new Error('Freezone sync conflicted with another player. Your latest action was not confirmed; try again.');
}

export async function listGameModes() {
  const client = requireClient();
  const { data, error } = await client
    .from('free_game_modes')
    .select('id, name, config, created_at')
    .order('created_at', { ascending: false });
  throwIfError(error);
  return data || [];
}

export async function saveGameMode(name, config) {
  const client = requireClient();
  const { data, error } = await client
    .from('free_game_modes')
    .insert({ name: name.trim(), config })
    .select('id, name, config, created_at')
    .single();
  throwIfError(error);
  return data;
}

export async function resetRoom(code) {
  const client = requireClient();
  const room = await fetchRoom(code);
  if (!room) throw new Error('A sala não existe mais.');

  const { error: movesError } = await client.from('moves').delete().eq('room_id', room.id);
  throwIfError(movesError);
  const { error: roomError } = await client
    .from('rooms')
    .update({
      fen: INITIAL_FEN,
      pgn: '',
      turn: 'w',
      free_mode_state: { enabled: false, blocks: [], pieces: [] },
      status: hasPlayer(room.white_player) && hasPlayer(room.black_player) ? 'active' : 'waiting',
      updated_at: new Date().toISOString()
    })
    .eq('id', room.id);
  throwIfError(roomError);
}

export function subscribeToRoom(roomId, onChange) {
  const client = requireClient();
  const channel = client
    .channel(`wizard-chess-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'moves', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
