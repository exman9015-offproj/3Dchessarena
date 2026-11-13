import {
  FREEZONE_ALLY_COST,
  FREEZONE_ALLY_ROLES,
  validateFreezoneThumbnailUrl
} from './freezoneRules.js';

export const FREEZONE_APPEARANCES = [
  { id: 'frog', label: 'Frog' },
  { id: 'eagle', label: 'Eagle' },
  { id: 'wolf', label: 'Wolf' },
  { id: 'owl', label: 'Owl' },
  { id: 'lion', label: 'Lion' },
  { id: 'turtle', label: 'Turtle' },
  { id: 'fox', label: 'Fox' },
  { id: 'bear', label: 'Bear' },
  { id: 'horse', label: 'Horse' },
  { id: 'dragon', label: 'Dragon' }
];

export const FREEZONE_VOICE_EVENTS = [
  { id: 'entry', label: 'Entering the arena' },
  { id: 'move', label: 'After this piece moves' },
  { id: 'capture', label: 'After this piece captures' },
  { id: 'death', label: 'When this piece is captured' },
  { id: 'allyDeath', label: 'When an ally is captured' },
  { id: 'purchase', label: 'When the player acquires a piece' },
  { id: 'upgrade', label: 'When the player buys an upgrade' },
  { id: 'inactivity', label: 'Long inactivity' },
  { id: 'inspection', label: 'Opponent inspects the piece' },
  { id: 'victory', label: 'Victory' },
  { id: 'defeat', label: 'Defeat' },
  { id: 'vulnerable', label: 'Piece threatened' }
];

export const FREEZONE_MAX_BOTS = 2;
export const FREEZONE_ROOM_CONFIG_VERSION = 1;
export const FREEZONE_ROOM_THEME_DEFAULTS = {
  surface: '#dcd3c2',
  edge: '#14171f',
  team: '#d4af37',
  wallpaperUrl: ''
};
export const FREEZONE_ARENA_FORMATS = [
  { id: 'square', label: 'Square' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'hexagonal', label: 'Hexagonal' }
];
export const FREEZONE_ROOM_TAGS = [
  'classic',
  'fast',
  'exploration',
  'custom-pieces',
  'orbs',
  'team-play',
  'beginner',
  'competitive'
];

/** @returns {'square' | 'triangle' | 'hexagonal'} */
export function normalizeFreezoneArenaFormat(value) {
  const format = typeof value === 'string' ? value.trim().toLowerCase() : 'square';
  return FREEZONE_ARENA_FORMATS.some((entry) => entry.id === format)
    ? format
    : 'square';
}

function normalizeHexColor(value, fallback) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (/^#[0-9a-fA-F]{3}$/.test(candidate) || /^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate.toLowerCase();
  }
  return fallback;
}

export function normalizeFreezoneRoomTheme(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const theme = {
    surface: normalizeHexColor(raw.surface ?? raw.surfaceColor, FREEZONE_ROOM_THEME_DEFAULTS.surface),
    edge: normalizeHexColor(raw.edge ?? raw.borderColor ?? raw.edgeColor, FREEZONE_ROOM_THEME_DEFAULTS.edge),
    team: normalizeHexColor(raw.team ?? raw.teamColor ?? raw.accent, FREEZONE_ROOM_THEME_DEFAULTS.team),
    wallpaperUrl: ''
  };
  const wallpaperUrl = typeof raw.wallpaperUrl === 'string' ? raw.wallpaperUrl.trim() : '';
  const validation = validateFreezoneThumbnailUrl(wallpaperUrl);
  theme.wallpaperUrl = validation.ok ? validation.url : '';
  return theme;
}

export function normalizeFreezoneRoomPublication(value = {}, fallbackName = 'Freezone Arena') {
  const raw = value && typeof value === 'object' ? value : {};
  const candidateUrl = typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl.trim() : '';
  const thumbnailValidation = validateFreezoneThumbnailUrl(candidateUrl);
  const thumbnailUrl = thumbnailValidation.ok ? thumbnailValidation.url : '';
  const validTags = new Set(FREEZONE_ROOM_TAGS);
  const tags = Array.from(new Set(
    (Array.isArray(raw.tags) ? raw.tags : [])
      .filter((tag) => typeof tag === 'string' && validTags.has(tag))
  )).slice(0, 5);
  const theme = normalizeFreezoneRoomTheme(raw.theme || raw.roomTheme || raw.palette || raw.colors || {});
  return {
    ...raw,
    version: FREEZONE_ROOM_CONFIG_VERSION,
    name: (typeof raw.name === 'string' && raw.name.trim()
      ? raw.name
      : fallbackName).trim().slice(0, 60),
    description: typeof raw.description === 'string'
      ? raw.description.trim().slice(0, 280)
      : '',
    thumbnailUrl,
    wallpaperUrl: theme.wallpaperUrl,
    tags,
    theme
  };
}

export function applyFreezoneAllyPurchase(player = {}, ally) {
  if (!ally || typeof ally.id !== 'string' || typeof ally.pieceId !== 'string' ||
      !FREEZONE_ALLY_ROLES.includes(ally.role)) {
    return { ok: false, error: 'Choose a valid allied bot role.' };
  }
  const allies = Array.isArray(player.allies) ? player.allies : [];
  if (allies.some((current) => current.id === ally.id || current.pieceId === ally.pieceId)) {
    return { ok: false, error: 'This allied bot has already been recruited.' };
  }
  const botOrbs = Math.max(0, Math.floor(Number(player.orbBalances?.bot) || 0));
  if (botOrbs < FREEZONE_ALLY_COST) {
    return {
      ok: false,
      error: `Collect ${FREEZONE_ALLY_COST - botOrbs} more bot orbs to recruit an ally.`
    };
  }
  return {
    ok: true,
    player: {
      ...player,
      orbBalances: { ...(player.orbBalances || {}), bot: botOrbs - FREEZONE_ALLY_COST },
      allies: [...allies, { ...ally }]
    }
  };
}

export const FREEZONE_AI_LANGUAGES = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en-US', label: 'English' },
  { id: 'es-ES', label: 'Español' }
];

export const FREEZONE_AI_VOICES = [
  { id: 'alloy', label: 'Alloy' },
  { id: 'ash', label: 'Ash' },
  { id: 'ballad', label: 'Ballad' },
  { id: 'coral', label: 'Coral' },
  { id: 'echo', label: 'Echo' },
  { id: 'fable', label: 'Fable' },
  { id: 'onyx', label: 'Onyx' },
  { id: 'nova', label: 'Nova' },
  { id: 'sage', label: 'Sage' },
  { id: 'shimmer', label: 'Shimmer' }
];

const appearanceIds = new Set(FREEZONE_APPEARANCES.map(({ id }) => id));
const aiLanguageIds = new Set(FREEZONE_AI_LANGUAGES.map(({ id }) => id));
const aiVoiceIds = new Set(FREEZONE_AI_VOICES.map(({ id }) => id));

export function sanitizeFreezoneProfile(profile = {}) {
  const voiceLines = {};
  for (const { id } of FREEZONE_VOICE_EVENTS) {
    voiceLines[id] = typeof profile.voiceLines?.[id] === 'string'
      ? profile.voiceLines[id].trim().slice(0, 120)
      : '';
  }
  return {
    appearance: appearanceIds.has(profile.appearance) ? profile.appearance : '',
    name: typeof profile.name === 'string' ? profile.name.trim().slice(0, 32) : '',
    title: typeof profile.title === 'string' ? profile.title.trim().slice(0, 32) : '',
    description: typeof profile.description === 'string'
      ? profile.description.trim().slice(0, 160)
      : '',
    personality: typeof profile.personality === 'string'
      ? profile.personality.trim().slice(0, 240)
      : '',
    language: aiLanguageIds.has(profile.language) ? profile.language : 'en-US',
    aiVoice: aiVoiceIds.has(profile.aiVoice) ? profile.aiVoice : 'alloy',
    catchphrase: typeof profile.catchphrase === 'string'
      ? profile.catchphrase.trim().slice(0, 120)
      : '',
    voiceLines
  };
}

export function sanitizeFreezoneAIDialogue(dialogue) {
  if (!dialogue || typeof dialogue.id !== 'string' || dialogue.id.length > 128 ||
      !dialogue.id.length || !Number.isSafeInteger(dialogue.createdAt) ||
      dialogue.createdAt < 0) return null;
  const lines = (Array.isArray(dialogue.lines) ? dialogue.lines : [])
    .slice(0, 2)
    .filter((line) => line && typeof line.pieceId === 'string' &&
      line.pieceId.length > 0 && line.pieceId.length <= 256 &&
      typeof line.text === 'string')
    .map((line) => ({
      pieceId: line.pieceId.slice(0, 256),
      text: line.text.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
    }))
    .filter((line) => line.text.length > 0);
  return lines.length ? { id: dialogue.id, createdAt: dialogue.createdAt, lines } : null;
}

export function sanitizeFreezoneAIHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-64)
    .filter((entry) => entry && typeof entry.id === 'string' &&
      entry.id.length > 0 && entry.id.length <= 160 &&
      typeof entry.pieceId === 'string' && entry.pieceId.length > 0 &&
      Number.isSafeInteger(entry.createdAt) && entry.createdAt >= 0 &&
      typeof entry.text === 'string')
    .map((entry) => ({
      id: entry.id,
      pieceId: entry.pieceId.slice(0, 256),
      name: typeof entry.name === 'string' ? entry.name.trim().slice(0, 32) : '',
      side: Number.isSafeInteger(entry.side) ? entry.side : -1,
      kind: typeof entry.kind === 'string' ? entry.kind.trim().slice(0, 24) : '',
      text: entry.text.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120),
      createdAt: entry.createdAt
    }))
    .filter((entry) => entry.text.length > 0)
    .slice(-32);
}

export function incrementFreezoneEliminations(piece, amount = 1) {
  if (!piece || !Number.isSafeInteger(amount) || amount < 1) return 0;
  piece.freeEliminations = Math.min(999999, Math.max(0, piece.freeEliminations || 0) + amount);
  return piece.freeEliminations;
}

export function getFreezoneEliminationLeaders(pieces) {
  const eligible = pieces.filter((piece) => Number.isSafeInteger(piece.eliminations) && piece.eliminations > 0);
  if (!eligible.length) return { count: 0, leaders: [] };
  const count = Math.max(...eligible.map((piece) => piece.eliminations));
  return { count, leaders: eligible.filter((piece) => piece.eliminations === count) };
}

export const FREEZONE_RECONNECT_GRACE_MS = 3 * 60 * 1000;

function copyFreezoneSessionState(state) {
  return {
    ...state,
    seats: Array.isArray(state.seats) ? state.seats.map((seat) => seat && { ...seat }) : [],
    pieces: Array.isArray(state.pieces) ? state.pieces.map((piece) => ({ ...piece })) : [],
    freezonePlayers: { ...(state.freezonePlayers || {}) },
    freezoneDepartures: { ...(state.freezoneDepartures || {}) },
    eliminationRecords: Array.isArray(state.eliminationRecords)
      ? state.eliminationRecords.map((record) => ({ ...record }))
      : [],
    eliminatedSeats: Array.isArray(state.eliminatedSeats) ? [...state.eliminatedSeats] : []
  };
}

function expireFreezoneSide(state, side, token) {
  state.seats[side] = null;
  state.pieces = state.pieces.filter((piece) => piece.side !== side);
  delete state.freezonePlayers[side];
  delete state.freezoneDepartures[token];
  state.eliminationRecords = state.eliminationRecords.filter((record) => record.side !== side);
  state.eliminatedSeats = state.eliminatedSeats.filter((seat) => seat !== side);
}

export function expireFreezoneSessions(state, now = Date.now(), onlineTokens = []) {
  const next = copyFreezoneSessionState(state || {});
  const online = new Set(onlineTokens);
  for (let side = 0; side < next.seats.length; side += 1) {
    const seat = next.seats[side];
    if (!seat?.token || seat.bot === true) continue;
    const departure = next.freezoneDepartures[seat.token];
    if (online.has(seat.token) && (!departure || departure.expiresAt > now)) continue;
    const expiresAt = Number(departure?.expiresAt);
    if (Number.isSafeInteger(expiresAt) && expiresAt <= now) {
      expireFreezoneSide(next, side, seat.token);
    }
  }
  return next;
}

export function reconcileFreezonePresence(state, onlinePlayers, now = Date.now()) {
  const members = Array.isArray(onlinePlayers) ? onlinePlayers : [];
  const onlineByToken = new Map(
    members.filter((member) => member && typeof member.token === 'string')
      .map((member) => [member.token, member])
  );
  const next = expireFreezoneSessions(state, now, onlineByToken.keys());
  for (let side = 0; side < next.seats.length; side += 1) {
    const seat = next.seats[side];
    if (!seat?.token || seat.bot === true) continue;
    const member = onlineByToken.get(seat.token);
    const departure = next.freezoneDepartures[seat.token];
    if (member) {
      if (departure && departure.expiresAt > now) {
        const existingIds = new Set(next.pieces.map((piece) => piece.id));
        next.pieces.push(...departure.pieces.filter((piece) => !existingIds.has(piece.id)));
        if (!next.freezonePlayers[side] && departure.player) {
          next.freezonePlayers[side] = departure.player;
        }
        delete next.freezoneDepartures[seat.token];
      }
      if (now - (Number(seat.lastSeenAt) || 0) >= 15000 ||
          seat.offlineSince || seat.reconnectUntil) {
        next.seats[side] = {
          ...seat,
          lastSeenAt: now,
          offlineSince: null,
          reconnectUntil: null
        };
      }
      continue;
    }

    if (departure) continue;
    const expiresAt = now + FREEZONE_RECONNECT_GRACE_MS;
    const pieces = next.pieces.filter((piece) => piece.side === side);
    const player = next.freezonePlayers[side] || null;
    next.freezoneDepartures[seat.token] = { side, expiresAt, pieces, player };
    next.pieces = next.pieces.filter((piece) => piece.side !== side);
    delete next.freezonePlayers[side];
    next.seats[side] = {
      ...seat,
      offlineSince: now,
      reconnectUntil: expiresAt
    };
  }
  return next;
}

export function getFreezonePlayerLeaderboard(records, seats) {
  const totals = new Map();
  for (let side = 0; side < (Array.isArray(seats) ? seats.length : 0); side += 1) {
    if (seats[side]?.token) totals.set(side, 0);
  }
  for (const record of Array.isArray(records) ? records : []) {
    if (!Number.isInteger(record?.side) || record.side < 0 ||
        !Number.isSafeInteger(record.eliminations) || record.eliminations <= 0) continue;
    totals.set(record.side, (totals.get(record.side) || 0) + record.eliminations);
  }
  return Array.from(totals, ([side, eliminations]) => ({
    side,
    name: seats?.[side]?.name || `Player ${side + 1}`,
    bot: seats?.[side]?.bot === true,
    eliminations
  })).sort((left, right) =>
    right.eliminations - left.eliminations || left.side - right.side
  );
}

export function resolveFreezoneVoice(voices, selectedVoiceURI) {
  if (!Array.isArray(voices) || !selectedVoiceURI) return null;
  return voices.find((voice) => voice.voiceURI === selectedVoiceURI) || null;
}

export function shouldSpeakFreezoneVoice(enabled, text, voiceAvailable) {
  return enabled === true && typeof text === 'string' && text.trim().length > 0 &&
    (voiceAvailable === undefined || voiceAvailable === true);
}

export function configureFreezoneBots(state, enabled, roomCode = '') {
  const next = {
    ...(state || {}),
    seats: Array.isArray(state?.seats) ? state.seats.slice() : [],
    pieces: Array.isArray(state?.pieces) ? state.pieces.slice() : [],
    freezonePlayers: { ...(state?.freezonePlayers || {}) },
    freezoneDepartures: { ...(state?.freezoneDepartures || {}) },
    eliminationRecords: Array.isArray(state?.eliminationRecords)
      ? state.eliminationRecords.slice()
      : [],
    eliminatedSeats: Array.isArray(state?.eliminatedSeats)
      ? state.eliminatedSeats.slice()
      : [],
    orbClaims: Array.isArray(state?.orbClaims) ? state.orbClaims.slice() : []
  };
  const botSides = next.seats.flatMap((seat, side) => seat?.bot === true ? [side] : []);
  const removedSides = [];
  const addedSides = [];

  if (!enabled) {
    for (const side of botSides) {
      const seat = next.seats[side];
      removedSides.push(side);
      next.seats[side] = null;
      delete next.freezonePlayers[side];
      delete next.freezoneDepartures[seat.token];
    }
    const removed = new Set(removedSides);
    const removedPieceIds = new Set(
      next.pieces.filter((piece) => removed.has(piece.side)).map((piece) => piece.id)
    );
    next.pieces = next.pieces.filter((piece) => !removed.has(piece.side));
    next.eliminationRecords = next.eliminationRecords.filter((record) =>
      !removed.has(record.side)
    );
    next.eliminatedSeats = next.eliminatedSeats.filter((side) => !removed.has(side));
    next.orbClaims = next.orbClaims.filter((claim) => !removed.has(claim.side));
    if (Array.isArray(next.movedPieceIds)) {
      next.movedPieceIds = next.movedPieceIds.filter((id) => !removedPieceIds.has(id));
    }
    next.botsEnabled = false;
    return { ok: true, state: next, addedSides, removedSides };
  }

  const excessSides = botSides.slice(FREEZONE_MAX_BOTS);
  for (const side of excessSides) {
    const seat = next.seats[side];
    removedSides.push(side);
    next.seats[side] = null;
    delete next.freezonePlayers[side];
    delete next.freezoneDepartures[seat.token];
  }
  const allowedBotSides = new Set(botSides.slice(0, FREEZONE_MAX_BOTS));
  if (excessSides.length) {
    const removed = new Set(excessSides);
    const removedPieceIds = new Set(
      next.pieces.filter((piece) => removed.has(piece.side)).map((piece) => piece.id)
    );
    next.pieces = next.pieces.filter((piece) => !removed.has(piece.side));
    next.eliminationRecords = next.eliminationRecords.filter((record) =>
      !removed.has(record.side)
    );
    next.eliminatedSeats = next.eliminatedSeats.filter((side) => !removed.has(side));
    next.orbClaims = next.orbClaims.filter((claim) => !removed.has(claim.side));
    if (Array.isArray(next.movedPieceIds)) {
      next.movedPieceIds = next.movedPieceIds.filter((id) => !removedPieceIds.has(id));
    }
  }

  for (let side = 0; side < next.seats.length &&
      allowedBotSides.size < FREEZONE_MAX_BOTS; side += 1) {
    if (next.seats[side]?.token) continue;
    next.seats[side] = {
      token: `bot:${roomCode || 'freezone'}:${side}`,
      name: `AI Bot ${side + 1}`,
      bot: true,
      needsArmy: true
    };
    allowedBotSides.add(side);
    addedSides.push(side);
  }

  if (!allowedBotSides.size) {
    return {
      ok: false,
      state: { ...next, botsEnabled: false },
      addedSides,
      removedSides,
      error: 'No empty seat is available for an adversary bot.'
    };
  }

  next.botsEnabled = true;
  return { ok: true, state: next, addedSides, removedSides };
}

export function mergeFreezoneRoomState(baseState, localState, currentState) {
  const base = baseState || {};
  const local = localState || {};
  const current = currentState || {};
  const basePieces = new Map((base.pieces || []).map((piece) => [piece.id, piece]));
  const localPieces = new Map((local.pieces || []).map((piece) => [piece.id, piece]));
  const mergedPieces = new Map((current.pieces || []).map((piece) => [piece.id, piece]));

  for (const id of basePieces.keys()) {
    if (!localPieces.has(id)) mergedPieces.delete(id);
  }
  for (const [id, piece] of localPieces) {
    if (JSON.stringify(basePieces.get(id)) !== JSON.stringify(piece)) mergedPieces.set(id, piece);
  }

  const baseOrbs = new Map((base.xpOrbs || []).map((orb) => [orb.id, orb]));
  const localOrbs = new Map((local.xpOrbs || []).map((orb) => [orb.id, orb]));
  const mergedOrbs = new Map((current.xpOrbs || []).map((orb) => [orb.id, orb]));
  for (const id of baseOrbs.keys()) {
    if (!localOrbs.has(id)) mergedOrbs.delete(id);
  }
  for (const [id, orb] of localOrbs) {
    if (JSON.stringify(baseOrbs.get(id)) !== JSON.stringify(orb)) mergedOrbs.set(id, orb);
  }

  const baseOrbClaims = new Map((base.orbClaims || []).map((claim) => [claim.orbId, claim]));
  const localOrbClaims = new Map((local.orbClaims || []).map((claim) => [claim.orbId, claim]));
  const mergedOrbClaims = new Map((current.orbClaims || []).map((claim) => [claim.orbId, claim]));
  const conflictedClaims = [];
  for (const [orbId, claim] of localOrbClaims) {
    if (baseOrbClaims.has(orbId)) continue;
    const currentClaim = mergedOrbClaims.get(orbId);
    if (currentClaim && currentClaim.side !== claim.side) {
      conflictedClaims.push(claim);
      continue;
    }
    mergedOrbClaims.set(orbId, currentClaim || claim);
  }

  const players = { ...(current.freezonePlayers || {}) };
  const playerSides = new Set([
    ...Object.keys(base.freezonePlayers || {}),
    ...Object.keys(local.freezonePlayers || {})
  ]);
  const mergeAlliedRoster = (baseAllies = [], localAllies = [], currentAllies = []) => {
    const baseById = new Map((Array.isArray(baseAllies) ? baseAllies : [])
      .filter((ally) => ally && typeof ally.id === 'string')
      .map((ally) => [ally.id, ally]));
    const localById = new Map((Array.isArray(localAllies) ? localAllies : [])
      .filter((ally) => ally && typeof ally.id === 'string')
      .map((ally) => [ally.id, ally]));
    const mergedById = new Map((Array.isArray(currentAllies) ? currentAllies : [])
      .filter((ally) => ally && typeof ally.id === 'string')
      .map((ally) => [ally.id, ally]));
    for (const [id, ally] of baseById) {
      if (!localById.has(id) && JSON.stringify(mergedById.get(id)) === JSON.stringify(ally)) {
        mergedById.delete(id);
      }
    }
    for (const [id, ally] of localById) {
      if (JSON.stringify(baseById.get(id)) !== JSON.stringify(ally)) {
        mergedById.set(id, mergedById.get(id) || ally);
      }
    }
    return Array.from(mergedById.values());
  };
  for (const side of playerSides) {
    const basePlayer = base.freezonePlayers?.[side];
    const localPlayer = local.freezonePlayers?.[side];
    if (JSON.stringify(basePlayer) === JSON.stringify(localPlayer)) continue;
    if (!localPlayer) {
      if (JSON.stringify(players[side]) === JSON.stringify(basePlayer)) delete players[side];
      continue;
    }
    const conflicted = conflictedClaims.filter((claim) => claim.side === Number(side));
    const currentPlayer = players[side] || {};
    const allies = mergeAlliedRoster(
      basePlayer?.allies || [],
      localPlayer.allies || [],
      currentPlayer.allies || []
    );
    if (!conflicted.length) {
      players[side] = { ...currentPlayer, ...localPlayer, allies };
      continue;
    }
    const adjusted = {
      ...localPlayer,
      orbBalances: { ...(localPlayer.orbBalances || {}) }
    };
    for (const claim of conflicted) {
      const xpAmount = Number.isFinite(claim.xpAmount)
        ? claim.xpAmount
        : claim.type === 'xp' ? claim.amount || 0 : 0;
      if (xpAmount) {
        adjusted.xp = Math.max(0, (adjusted.xp || 0) - xpAmount);
        adjusted.orbBalances.xp = adjusted.xp;
      }
      if (claim.type !== 'xp') {
        adjusted.orbBalances[claim.type] = Math.max(
          0,
          (adjusted.orbBalances[claim.type] || 0) - 1
        );
      }
    }
    players[side] = { ...adjusted, allies };
  }

  const baseRecords = new Map((base.eliminationRecords || []).map((record) => [record.id, record]));
  const localRecords = new Map((local.eliminationRecords || []).map((record) => [record.id, record]));
  const records = new Map((current.eliminationRecords || []).map((record) => [record.id, record]));
  for (const id of baseRecords.keys()) {
    if (localRecords.has(id)) continue;
    if (JSON.stringify(records.get(id)) === JSON.stringify(baseRecords.get(id))) {
      records.delete(id);
    }
  }
  for (const [id, record] of localRecords) {
    if (JSON.stringify(baseRecords.get(id)) === JSON.stringify(record)) continue;
    const currentRecord = records.get(id);
    records.set(id, {
      ...currentRecord,
      ...record,
      eliminations: Math.max(currentRecord?.eliminations || 0, record.eliminations || 0)
    });
  }

  const baseSeats = Array.isArray(base.seats) ? base.seats : [];
  const localSeats = Array.isArray(local.seats) ? local.seats : [];
  const mergedSeats = Array.isArray(current.seats) ? current.seats.slice() : localSeats.slice();
  for (let side = 0; side < Math.max(baseSeats.length, localSeats.length); side += 1) {
    const baseSeat = baseSeats[side] || null;
    const localSeat = localSeats[side] || null;
    if (JSON.stringify(baseSeat) === JSON.stringify(localSeat)) continue;
    const currentSeat = mergedSeats[side] || null;
    const canApply = JSON.stringify(currentSeat) === JSON.stringify(baseSeat) ||
      JSON.stringify(currentSeat) === JSON.stringify(localSeat);
    if (canApply) mergedSeats[side] = localSeat;
  }

  const baseDepartures = base.freezoneDepartures || {};
  const localDepartures = local.freezoneDepartures || {};
  const departures = { ...(current.freezoneDepartures || {}) };
  for (const token of new Set([
    ...Object.keys(baseDepartures),
    ...Object.keys(localDepartures)
  ])) {
    const baseDeparture = baseDepartures[token];
    const localDeparture = localDepartures[token];
    if (JSON.stringify(baseDeparture) === JSON.stringify(localDeparture)) continue;
    if (!localDeparture) {
      if (JSON.stringify(departures[token]) === JSON.stringify(baseDeparture)) delete departures[token];
    } else if (JSON.stringify(departures[token]) === JSON.stringify(baseDeparture) ||
        JSON.stringify(departures[token]) === JSON.stringify(localDeparture)) {
      departures[token] = localDeparture;
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
  const mutantZone = JSON.stringify(base.mutantZone) !== JSON.stringify(local.mutantZone)
    ? local.mutantZone
    : current.mutantZone ?? local.mutantZone ?? null;
  const localMusicUrlChanged = base.sharedMusicUrl !== local.sharedMusicUrl;
  const remoteMusicUrlChanged = base.sharedMusicUrl !== current.sharedMusicUrl;
  const sharedMusicUrl = localMusicUrlChanged
    ? local.sharedMusicUrl
    : current.sharedMusicUrl ?? local.sharedMusicUrl ?? '';
  const musicUrlChanged = localMusicUrlChanged || remoteMusicUrlChanged;
  const sharedMusicPlaying = musicUrlChanged
    ? false
    : base.sharedMusicPlaying !== local.sharedMusicPlaying
      ? Boolean(local.sharedMusicPlaying)
      : Boolean(current.sharedMusicPlaying ?? local.sharedMusicPlaying);
  const sharedMusicStartedAt = musicUrlChanged || !sharedMusicPlaying
    ? 0
    : base.sharedMusicStartedAt !== local.sharedMusicStartedAt
      ? local.sharedMusicStartedAt
      : current.sharedMusicStartedAt ?? local.sharedMusicStartedAt ?? 0;
  const aiDialogueCandidates = [current.aiDialogue, local.aiDialogue]
    .map(sanitizeFreezoneAIDialogue)
    .filter(Boolean);
  const aiDialogue = aiDialogueCandidates.reduce((latest, candidate) =>
    !latest || candidate.createdAt >= latest.createdAt ? candidate : latest, null);
  const historyById = new Map();
  for (const entry of [
    ...sanitizeFreezoneAIHistory(current.aiHistory),
    ...sanitizeFreezoneAIHistory(local.aiHistory)
  ]) {
    historyById.set(entry.id, entry);
  }
  const aiHistory = Array.from(historyById.values())
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-32);
  const roomConfig = current.config ?? local.config ?? base.config;

  return {
    ...current,
    ...local,
    ...(roomConfig ? {
      config: roomConfig,
      boardSize: roomConfig.boardSize ?? current.boardSize ?? local.boardSize ?? base.boardSize
    } : {}),
    seats: mergedSeats,
    freezonePlayers: players,
    freezoneDepartures: departures,
    botsEnabled: current.botsEnabled === base.botsEnabled
      ? Boolean(local.botsEnabled)
      : Boolean(current.botsEnabled),
    pieces: Array.from(mergedPieces.values()),
    xpOrbs,
    orbClaims: Array.from(mergedOrbClaims.values()).slice(-1024),
    mutantZone,
    mutantZoneInitialized: Boolean(
      current.mutantZoneInitialized || local.mutantZoneInitialized
    ),
    sharedMusicUrl,
    sharedMusicPlaying,
    sharedMusicStartedAt,
    aiDialogue,
    aiHistory,
    eliminationRecords: Array.from(records.values())
  };
}
