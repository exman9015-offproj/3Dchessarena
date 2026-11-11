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
  { id: 'inactivity', label: 'Long inactivity' },
  { id: 'inspection', label: 'Opponent inspects the piece' },
  { id: 'victory', label: 'Victory' },
  { id: 'defeat', label: 'Defeat' },
  { id: 'vulnerable', label: 'Piece threatened' }
];

const appearanceIds = new Set(FREEZONE_APPEARANCES.map(({ id }) => id));

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
    catchphrase: typeof profile.catchphrase === 'string'
      ? profile.catchphrase.trim().slice(0, 120)
      : '',
    voiceLines
  };
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

export function resolveFreezoneVoice(voices, selectedVoiceURI) {
  if (!Array.isArray(voices) || !selectedVoiceURI) return null;
  return voices.find((voice) => voice.voiceURI === selectedVoiceURI) || null;
}

export function shouldSpeakFreezoneVoice(enabled, text, voiceAvailable) {
  return enabled === true && typeof text === 'string' && text.trim().length > 0 &&
    (voiceAvailable === undefined || voiceAvailable === true);
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

  const players = { ...(current.freezonePlayers || {}) };
  for (const [side, player] of Object.entries(local.freezonePlayers || {})) {
    if (JSON.stringify(base.freezonePlayers?.[side]) !== JSON.stringify(player)) {
      players[side] = player;
    }
  }

  const baseRecords = new Map((base.eliminationRecords || []).map((record) => [record.id, record]));
  const localRecords = new Map((local.eliminationRecords || []).map((record) => [record.id, record]));
  const records = new Map((current.eliminationRecords || []).map((record) => [record.id, record]));
  for (const [id, record] of localRecords) {
    if (JSON.stringify(baseRecords.get(id)) === JSON.stringify(record)) continue;
    const currentRecord = records.get(id);
    records.set(id, {
      ...currentRecord,
      ...record,
      eliminations: Math.max(currentRecord?.eliminations || 0, record.eliminations || 0)
    });
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
    ...local,
    seats: current.seats || local.seats || [],
    freezonePlayers: players,
    pieces: Array.from(mergedPieces.values()),
    xpOrbs,
    eliminationRecords: Array.from(records.values())
  };
}
