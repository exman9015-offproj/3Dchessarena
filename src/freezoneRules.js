export const FREEZONE_BOARD_SIZE = 64;
export const FREEZONE_MUTANT_DURATION_MS = 3 * 60 * 1000;
export const FREEZONE_ORB_TARGET_COUNT = 512;
export const FREEZONE_ALLY_COST = 10;
export const FREEZONE_ORB_TYPES = ['xp', 'red', 'blue', 'yellow', 'purple', 'white', 'bot', 'movement'];
export const FREEZONE_MOVEMENT_ORB_COST = 1;
export const FREEZONE_ENVELOPE_ORB_COST = 2;
export const FREEZONE_BASE_ENVELOPE_ROWS = 1;
export const FREEZONE_BASE_ENVELOPE_COLS = 1;
export const FREEZONE_PIECE_TYPES = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
export const FREEZONE_TILE_GEOMETRIES = ['square', 'triangle', 'hexagonal', 'round'];
export const FREEZONE_MAX_MOVEMENT_RANGE = 8;
export const FREEZONE_MAX_PIECE_COOLDOWN_MS = 60000;
export const FREEZONE_DEFAULT_ORB_XP = {
  xp: 1,
  red: 0,
  blue: 0,
  yellow: 0,
  purple: 0,
  white: 0,
  bot: 0,
  movement: 0
};
export const FREEZONE_ALLY_ROLES = [
  'strategic',
  'offensive',
  'defensive',
  'guardian',
  'collector'
];
export const FREEZONE_ALLY_ROLE_LABELS = {
  strategic: 'Strategic',
  offensive: 'Offensive',
  defensive: 'Defensive',
  guardian: 'Guardian',
  collector: 'Orb collector'
};
export const FREEZONE_ENVELOPE_OPTIONS = [
  { rows: 1, cols: 1 },
  { rows: 1, cols: 2 },
  { rows: 2, cols: 2 },
  { rows: 2, cols: 3 },
  { rows: 3, cols: 3 },
  { rows: 2, cols: 4 },
  { rows: 3, cols: 4 },
  { rows: 4, cols: 4 },
  { rows: 3, cols: 5 },
  { rows: 4, cols: 5 },
  { rows: 5, cols: 5 },
  { rows: 4, cols: 6 },
  { rows: 5, cols: 6 },
  { rows: 6, cols: 6 }
];

export function freezoneOffsetKey(row, col) {
  return `${row},${col}`;
}

export function isValidFreezoneCell(row, col, boardSize = FREEZONE_BOARD_SIZE, arenaFormat = 'square') {
  if (!Number.isInteger(row) || !Number.isInteger(col) || !Number.isInteger(boardSize) || boardSize <= 0) {
    return false;
  }
  if (arenaFormat === 'triangle') {
    return row >= 0 && row < boardSize && col >= 0 && col < boardSize && row + col < boardSize;
  }
  if (arenaFormat === 'hexagonal') {
    const center = (boardSize - 1) / 2;
    const radius = Math.max(1, center);
    const q = col - center;
    const r = row - center;
    return row >= 0 && row < boardSize && col >= 0 && col < boardSize &&
      Math.abs(q) <= radius &&
      Math.abs(r) <= radius &&
      Math.abs(q - r) <= radius;
  }
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

export function normalizeFreezoneTileGeometry(value, arenaFormat = 'square') {
  if (FREEZONE_TILE_GEOMETRIES.includes(value)) return value;
  return arenaFormat === 'hexagonal' ? 'hexagonal' : 'square';
}

/**
 * @param {unknown} value
 * @returns {{enabledTypes: string[], xpByType: Record<string, number>}}
 */
export function normalizeFreezoneOrbSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const enabledTypes = Array.isArray(source.enabledTypes)
    ? Array.from(new Set(source.enabledTypes.filter((type) => FREEZONE_ORB_TYPES.includes(type))))
    : [...FREEZONE_ORB_TYPES];
  const sourceXp = source.xpByType && typeof source.xpByType === 'object'
    ? source.xpByType
    : {};
  const xpByType = Object.fromEntries(FREEZONE_ORB_TYPES.map((type) => {
    const raw = sourceXp[type];
    const amount = Number.isFinite(raw) ? Math.floor(raw) : FREEZONE_DEFAULT_ORB_XP[type];
    return [type, Math.max(0, Math.min(1000, amount))];
  }));
  return { enabledTypes, xpByType };
}

/**
 * @param {unknown} value
 * @returns {Record<string, {rows: number, cols: number}>}
 */
export function normalizeFreezoneMovementLimits(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FREEZONE_PIECE_TYPES.map((type) => {
    const limit = source[type] && typeof source[type] === 'object' ? source[type] : {};
    const rows = Number.isFinite(limit.rows) ? Math.floor(limit.rows) : FREEZONE_MAX_MOVEMENT_RANGE;
    const cols = Number.isFinite(limit.cols) ? Math.floor(limit.cols) : FREEZONE_MAX_MOVEMENT_RANGE;
    return [type, {
      rows: Math.max(1, Math.min(FREEZONE_MAX_MOVEMENT_RANGE, rows)),
      cols: Math.max(1, Math.min(FREEZONE_MAX_MOVEMENT_RANGE, cols))
    }];
  }));
}

export function getFreezoneEffectiveMovementEnvelope(envelopeRows, envelopeCols, movementLimit) {
  const limit = normalizeFreezoneMovementLimits({ pawn: movementLimit }).pawn;
  const rows = Number.isFinite(envelopeRows)
    ? Math.max(1, Math.floor(envelopeRows))
    : FREEZONE_MAX_MOVEMENT_RANGE;
  const cols = Number.isFinite(envelopeCols)
    ? Math.max(1, Math.floor(envelopeCols))
    : FREEZONE_MAX_MOVEMENT_RANGE;
  return {
    rows: Math.min(rows, limit.rows),
    cols: Math.min(cols, limit.cols)
  };
}

/**
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
export function normalizeFreezonePieceCooldowns(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(FREEZONE_PIECE_TYPES.map((type) => {
    const delay = Number.isFinite(source[type]) ? Math.floor(source[type]) : 0;
    return [type, Math.max(0, Math.min(FREEZONE_MAX_PIECE_COOLDOWN_MS, delay))];
  }));
}

export function getFreezoneArenaCells(boardSize = FREEZONE_BOARD_SIZE, arenaFormat = 'square') {
  const format = arenaFormat === 'triangle' || arenaFormat === 'hexagonal' ? arenaFormat : 'square';
  const cells = [];
  for (let row = 0; row < boardSize; row += 1) {
    for (let col = 0; col < boardSize; col += 1) {
      if (isValidFreezoneCell(row, col, boardSize, format)) cells.push({ r: row, c: col });
    }
  }
  return cells;
}

/**
 * @param {number} boardSize
 * @param {string} arenaFormat
 * @param {Array<{r: number, c: number, level: number, kind: string}>} terrainChanges
 * @returns {Map<string, number[]>}
 */
export function getFreezoneDraftPlayableLevels(boardSize, arenaFormat, terrainChanges) {
  const changesByCell = new Map();
  for (const change of Array.isArray(terrainChanges) ? terrainChanges : []) {
    if (!change || typeof change !== 'object') continue;
    if (!isValidFreezoneCell(change.r, change.c, boardSize, arenaFormat) ||
        !Number.isInteger(change.level) || change.level < -3 || change.level > 3) continue;
    const key = freezoneOffsetKey(change.r, change.c);
    const changes = changesByCell.get(key) || [];
    changes.push(change);
    changesByCell.set(key, changes);
  }

  const playableLevels = new Map();
  for (const cell of getFreezoneArenaCells(boardSize, arenaFormat)) {
    const key = freezoneOffsetKey(cell.r, cell.c);
    const changes = changesByCell.get(key) || [];
    const levels = new Set();
    if (!changes.some((change) =>
      change.level === 0 && (change.kind === 'erase' || change.kind === 'wall')
    )) {
      levels.add(0);
    }
    for (const change of changes) {
      if (change.level !== 0 && change.kind === 'floor' &&
          !changes.some((other) =>
            other.level === change.level && (other.kind === 'erase' || other.kind === 'wall')
          )) {
        levels.add(change.level);
      }
    }
    if (levels.size) playableLevels.set(key, [...levels].sort((a, b) => a - b));
  }
  return playableLevels;
}

export function getFreezoneTerrainScaleKeys(selectedKeys, boardSize, arenaFormat, step) {
  if (!Array.isArray(selectedKeys) || !Number.isInteger(boardSize) || boardSize <= 0 ||
      !Number.isInteger(step) || step === 0) return [];
  const cells = [...new Set(selectedKeys)].map((key) => {
    if (typeof key !== 'string') return null;
    const parts = key.split(',');
    if (parts.length !== 3 || parts.some((part) => !/^-?\d+$/.test(part))) return null;
    const values = parts.map(Number);
    if (!values.every(Number.isInteger) ||
        !isValidFreezoneCell(values[0], values[1], boardSize, arenaFormat) ||
        Math.abs(values[2]) > 3) return null;
    return { r: values[0], c: values[1], level: values[2] };
  });
  if (!cells.length || cells.some((cell) => cell === null)) return [];
  const levels = new Set(cells.map((cell) => cell.level));
  if (levels.size !== 1) return [];
  const minR = Math.min(...cells.map((cell) => cell.r));
  const maxR = Math.max(...cells.map((cell) => cell.r));
  const minC = Math.min(...cells.map((cell) => cell.c));
  const maxC = Math.max(...cells.map((cell) => cell.c));
  const currentSize = Math.max(maxR - minR + 1, maxC - minC + 1);
  const nextSize = Math.max(1, Math.min(boardSize, currentSize + step));
  if (nextSize === currentSize) return [];
  const centerR = (minR + maxR) * 0.5;
  const centerC = (minC + maxC) * 0.5;
  const startR = Math.max(0, Math.min(boardSize - nextSize, Math.round(centerR - (nextSize - 1) * 0.5)));
  const startC = Math.max(0, Math.min(boardSize - nextSize, Math.round(centerC - (nextSize - 1) * 0.5)));
  const level = cells[0].level;
  return getFreezoneArenaCells(boardSize, arenaFormat)
    .filter((cell) =>
      cell.r >= startR && cell.r < startR + nextSize &&
      cell.c >= startC && cell.c < startC + nextSize
    )
    .map((cell) => `${cell.r},${cell.c},${level}`);
}

export function getFreezoneArenaCellPosition(row, col, boardSize = FREEZONE_BOARD_SIZE, arenaFormat = 'square') {
  const center = (boardSize - 1) / 2;
  if (arenaFormat === 'triangle') {
    const q = col - row * 0.5;
    return {
      x: (q - center * 0.5) * 1.12,
      z: (row - center) * 0.9
    };
  }
  if (arenaFormat === 'hexagonal') {
    const q = col - row * 0.5;
    return {
      x: Math.sqrt(3) * (q - center * 0.5) * 0.9,
      z: (row - center) * 1.5 * 0.9
    };
  }
  return { x: col - center, z: row - center };
}

export function getFreezoneArenaSpawnPoint(side = 0, boardSize = FREEZONE_BOARD_SIZE, arenaFormat = 'square', playerCount = 2) {
  const format = arenaFormat === 'triangle' || arenaFormat === 'hexagonal' ? arenaFormat : 'square';
  const validCells = getFreezoneArenaCells(boardSize, format);
  if (!validCells.length) return { r: 0, c: 0 };

  if (format === 'triangle') {
    const triangleCount = Math.max(1, Math.min(playerCount, 10));
    const index = Math.min(validCells.length - 1, Math.round((side % triangleCount) * (validCells.length - 1) / Math.max(1, triangleCount - 1)));
    return validCells[index];
  }

  if (format === 'hexagonal') {
    const center = (boardSize - 1) / 2;
    const radius = Math.max(1, center);
    const perimeter = validCells
      .filter((cell) => {
        const q = cell.c - center;
        const r = cell.r - center;
        return Math.max(Math.abs(q), Math.abs(r), Math.abs(q - r)) >= radius - 1;
      })
      .sort((left, right) => {
        const leftPosition = getFreezoneArenaCellPosition(left.r, left.c, boardSize, format);
        const rightPosition = getFreezoneArenaCellPosition(right.r, right.c, boardSize, format);
        return Math.atan2(leftPosition.z, leftPosition.x) -
          Math.atan2(rightPosition.z, rightPosition.x);
      });
    const playerSlots = Math.max(1, Math.min(playerCount, 10));
    const index = Math.floor((side % playerSlots) * perimeter.length / playerSlots);
    return perimeter[index] || validCells[0];
  }

  const middle = Math.floor(boardSize / 2);
  const slot = Math.max(0, side % Math.max(1, playerCount));
  const spread = Math.min(2, Math.max(0, Math.floor(slot / 2)));
  return { r: middle + (slot % 2 === 0 ? -spread : spread), c: middle + (slot % 2 === 0 ? spread : -spread) };
}

export function isLinearOffset(row, col) {
  return row === 0 || col === 0 || Math.abs(row) === Math.abs(col);
}

function linePath(from, to) {
  const rowDelta = to.r - from.r;
  const colDelta = to.c - from.c;
  const rowCount = Math.abs(rowDelta);
  const colCount = Math.abs(colDelta);
  const rowStep = Math.sign(rowDelta);
  const colStep = Math.sign(colDelta);
  const length = Math.max(rowCount, colCount);
  if (!length) return [];
  const path = [];
  let row = from.r;
  let col = from.c;
  let error = rowCount - colCount;
  while (row !== to.r || col !== to.c) {
    const doubledError = 2 * error;
    if (doubledError > -colCount) {
      error -= colCount;
      row += rowStep;
    }
    if (doubledError < rowCount) {
      error += rowCount;
      col += colStep;
    }
    path.push({ r: row, c: col });
  }
  return path;
}

function insideEnvelope(row, col, envelopeRows, envelopeCols) {
  return Math.abs(row) <= envelopeRows && Math.abs(col) <= envelopeCols;
}

function movementEntries(piece) {
  const teleports = new Set((piece.teleports || []).map(([row, col]) => freezoneOffsetKey(row, col)));
  const jumps = new Set((piece.jumps || []).map(([row, col]) => freezoneOffsetKey(row, col)));
  const offsets = Array.isArray(piece.moves) ? piece.moves : piece.freeMoves || [];
  return offsets.map(([row, col]) => {
    const key = freezoneOffsetKey(row, col);
    if (teleports.has(key)) return { row, col, kind: 'teleport' };
    if (jumps.has(key)) return { row, col, kind: 'jump' };
    return { row, col, kind: 'drag' };
  });
}

/**
 * @param {{ r: number, c: number, side?: number, freeSide?: number, id?: string, freeId?: string, slide?: boolean, moves?: Array<[number, number]>, freeMoves?: Array<[number, number]>, jumps?: Array<[number, number]>, teleports?: Array<[number, number]> }} piece
 * @param {{ boardSize?: number, envelopeRows?: number, envelopeCols?: number, stepsRemaining?: number, removedBlocks?: Array<[number, number]>, pieces?: Array<{ r: number, c: number, side?: number, freeSide?: number, id?: string, freeId?: string }>, arenaFormat?: string }} options
 */
export function computeFreezoneMoves(piece, {
  boardSize = FREEZONE_BOARD_SIZE,
  envelopeRows = 3,
  envelopeCols = 3,
  stepsRemaining = 1,
  removedBlocks = [],
  pieces = [],
  arenaFormat = 'square'
} = {}) {
  if (!piece || !Number.isSafeInteger(piece.r) || !Number.isSafeInteger(piece.c)) return [];
  const rows = new Set(removedBlocks.map(([row, col]) => freezoneOffsetKey(row, col)));
  const occupied = new Map(pieces.map((other) => [freezoneOffsetKey(other.r, other.c), other]));
  const candidates = new Map();
  const addCandidate = (candidate) => {
    const key = freezoneOffsetKey(candidate.r, candidate.c);
    const existing = candidates.get(key);
    if (!existing || candidate.kind !== 'teleport') candidates.set(key, candidate);
  };

  for (const { row: dr, col: dc, kind } of movementEntries(piece)) {
    if (kind === 'teleport') {
      if (!insideEnvelope(dr, dc, envelopeRows, envelopeCols) ||
          dr === 0 && dc === 0 && !Array.isArray(piece.moves || piece.freeMoves)) continue;
      const r = piece.r + dr;
      const c = piece.c + dc;
      if (!isValidFreezoneCell(r, c, boardSize, arenaFormat) ||
          rows.has(freezoneOffsetKey(r, c))) continue;
      const occupant = occupied.get(freezoneOffsetKey(r, c));
      const pieceSide = piece.side ?? piece.freeSide;
      const occupantSide = occupant?.side ?? occupant?.freeSide;
      const isSelf = occupant && (occupant.id === piece.id || occupant.freeId === piece.freeId);
      if (occupant && !isSelf && occupantSide === pieceSide) continue;
      addCandidate({
        r,
        c,
        kind,
        path: [],
        stepCost: 1,
        capture: Boolean(occupant && !isSelf)
      });
      continue;
    }

    const maxSpan = Math.max(Math.abs(dr), Math.abs(dc));
    if (kind === 'jump') {
      if (maxSpan > stepsRemaining ||
          !insideEnvelope(dr, dc, envelopeRows, envelopeCols)) continue;
      const path = linePath(piece, { r: piece.r + dr, c: piece.c + dc });
      if (!path) continue;
      let blocked = false;
      for (let index = 0; index < path.length - 1; index += 1) {
        const cell = path[index];
        if (rows.has(freezoneOffsetKey(cell.r, cell.c)) ||
            occupied.has(freezoneOffsetKey(cell.r, cell.c))) {
          blocked = true;
          break;
        }
      }
      const destination = path[path.length - 1];
      if (!isValidFreezoneCell(destination.r, destination.c, boardSize, arenaFormat)) continue;
      const occupant = occupied.get(freezoneOffsetKey(destination.r, destination.c));
      if (!blocked && (!occupant ||
          (occupant.side ?? occupant.freeSide) !== (piece.side ?? piece.freeSide))) {
        addCandidate({
          ...destination,
          kind,
          path,
          stepCost: path.length,
          capture: Boolean(occupant)
        });
      }
      continue;
    }

    if (!isLinearOffset(dr, dc) || dr === 0 && dc === 0) continue;
    const unitRow = maxSpan ? dr / maxSpan : 0;
    const unitCol = maxSpan ? dc / maxSpan : 0;
    if (!Number.isInteger(unitRow) || !Number.isInteger(unitCol) ||
        unitRow === 0 && unitCol === 0) continue;

    const reach = unitRow === 0
      ? envelopeCols
      : unitCol === 0 ? envelopeRows : Math.min(envelopeRows, envelopeCols);
    const maxSteps = Math.min(Math.max(0, Math.floor(stepsRemaining)), reach);
    const firstStep = piece.slide === true ? 1 : maxSpan;
    const lastStep = piece.slide === true ? maxSteps : Math.min(maxSteps, maxSpan);
    for (let step = firstStep; step <= lastStep; step += 1) {
      const r = piece.r + unitRow * step;
      const c = piece.c + unitCol * step;
      if (!isValidFreezoneCell(r, c, boardSize, arenaFormat) ||
          rows.has(freezoneOffsetKey(r, c))) break;
      const occupant = occupied.get(freezoneOffsetKey(r, c));
      if (occupant && (occupant.id === piece.id || occupant.freeId === piece.freeId)) continue;
      if (occupant && (occupant.side ?? occupant.freeSide) === (piece.side ?? piece.freeSide)) break;
      const path = linePath(piece, { r, c });
      addCandidate({
        r,
        c,
        kind: 'drag',
        path,
        stepCost: step,
        capture: Boolean(occupant)
      });
      if (occupant) break;
    }
  }
  return Array.from(candidates.values());
}

export function canUpgradeFreezoneEnvelope(currentRows, currentCols, nextRows, nextCols) {
  const next = FREEZONE_ENVELOPE_OPTIONS.find(
    (option) => option.rows === nextRows && option.cols === nextCols
  );
  return Boolean(next && next.rows >= currentRows && next.cols >= currentCols &&
    next.rows + next.cols > currentRows + currentCols);
}

export function getFreezoneEnvelopeUpgradeCost(currentRows, currentCols, nextRows, nextCols) {
  if (!canUpgradeFreezoneEnvelope(currentRows, currentCols, nextRows, nextCols)) return 0;
  return (nextRows + nextCols - currentRows - currentCols) * FREEZONE_ENVELOPE_ORB_COST;
}

export function normalizeFreezoneUnlockedMoves(value, moves = []) {
  const moveKeys = new Set(
    (Array.isArray(moves) ? moves : [])
      .filter((offset) => Array.isArray(offset) && Number.isSafeInteger(offset[0]) &&
        Number.isSafeInteger(offset[1]))
      .map(([row, col]) => freezoneOffsetKey(row, col))
  );
  const seen = new Set();
  const result = [];
  for (const offset of Array.isArray(value) ? value : []) {
    if (!Array.isArray(offset) || !Number.isSafeInteger(offset[0]) ||
        !Number.isSafeInteger(offset[1])) continue;
    const key = freezoneOffsetKey(offset[0], offset[1]);
    if (!moveKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    result.push([offset[0], offset[1]]);
    if (result.length >= 48) break;
  }
  return result;
}

export function applyFreezoneMovementUnlock(piece, row, col, kind) {
  if (!piece || !Number.isSafeInteger(row) || !Number.isSafeInteger(col) ||
      Math.abs(row) > FREEZONE_MAX_MOVEMENT_RANGE ||
      Math.abs(col) > FREEZONE_MAX_MOVEMENT_RANGE ||
      !['drag', 'jump', 'teleport'].includes(kind) ||
      (row === 0 && col === 0 && kind !== 'teleport')) {
    return { ok: false, error: 'Choose a valid movement offset and type.' };
  }
  const moves = Array.isArray(piece.moves) ? piece.moves.map(([r, c]) => [r, c]) : [];
  const jumps = Array.isArray(piece.jumps) ? piece.jumps.map(([r, c]) => [r, c]) : [];
  const teleports = Array.isArray(piece.teleports) ? piece.teleports.map(([r, c]) => [r, c]) : [];
  const unlockedMoves = normalizeFreezoneUnlockedMoves(piece.unlockedMoves, moves);
  const existingIndex = moves.findIndex(([r, c]) => r === row && c === col);
  const currentKind = teleports.some(([r, c]) => r === row && c === col)
    ? 'teleport'
    : jumps.some(([r, c]) => r === row && c === col) ? 'jump' : 'drag';
  if (existingIndex >= 0 && currentKind === kind) {
    return { ok: false, error: 'This offset already uses that movement type.' };
  }
  if (existingIndex < 0 && moves.length >= 48) {
    return { ok: false, error: 'This piece already has the maximum number of movement offsets.' };
  }

  if (existingIndex < 0) moves.push([row, col]);
  const updateMembership = (offsets, enabled) => {
    const withoutOffset = offsets.filter(([r, c]) => r !== row || c !== col);
    return enabled ? [...withoutOffset, [row, col]] : withoutOffset;
  };
  const nextJumps = updateMembership(jumps, kind === 'jump');
  const nextTeleports = updateMembership(teleports, kind === 'teleport');
  const nextUnlockedMoves = existingIndex < 0
    ? [...unlockedMoves, [row, col]]
    : unlockedMoves;
  return {
    ok: true,
    piece: {
      ...piece,
      moves,
      jumps: nextJumps,
      teleports: nextTeleports,
      unlockedMoves: nextUnlockedMoves
    },
    addedOffset: existingIndex < 0
  };
}

export function freezoneFocusPose(cameraPosition, orbitTarget, pieceTarget, distance = 9.5, arenaFormat = 'square') {
  const offset = cameraPosition.map((value, index) => value - orbitTarget[index]);
  const magnitude = Math.hypot(...offset);
  const direction = magnitude > 0.01
    ? offset.map((value) => value / magnitude)
    : [0, 0.45, 0.89];
  const shapeScale = arenaFormat === 'triangle' ? 1.12 : arenaFormat === 'hexagonal' ? 1.24 : 1;
  const lateralBias = arenaFormat === 'hexagonal' ? 1.18 : 1;
  const scaled = direction.map((value) => value * distance * shapeScale);
  scaled[0] *= lateralBias;
  scaled[2] *= lateralBias;
  scaled[1] = Math.max(2.8, Math.abs(scaled[1]));
  return {
    position: pieceTarget.map((value, index) => value + scaled[index]),
    target: [...pieceTarget]
  };
}

export function freezoneCapturePhase(progress) {
  if (!Number.isFinite(progress) || progress < 0.32) return 'approach';
  if (progress < 0.58) return 'strike';
  if (progress < 1) return 'advance';
  return 'complete';
}

export function randomFreezoneOrbType(random = Math.random, enabledTypes = null) {
  const weights = {
    xp: 0.37,
    red: 0.123,
    blue: 0.123,
    yellow: 0.106,
    purple: 0.079,
    white: 0.079,
    movement: 0.04,
    bot: 0.12
  };
  const active = ['xp', 'red', 'blue', 'yellow', 'purple', 'white', 'movement', 'bot']
    .map((type) => ({ type, weight: weights[type] }))
    .filter(({ type }) => !Array.isArray(enabledTypes) || enabledTypes.includes(type));
  const totalWeight = active.reduce((sum, entry) => sum + entry.weight, 0);
  if (!active.length) return '';
  let roll = random() * totalWeight;
  for (const entry of active) {
    roll -= entry.weight;
    if (roll < 0) return entry.type;
  }
  return active[active.length - 1].type;
}

export function chooseFreezoneAllyMove({ role, piece, moves, pieces, orbs }) {
  if (!FREEZONE_ALLY_ROLES.includes(role) || !piece || !Array.isArray(moves) || !moves.length) {
    return null;
  }
  const side = piece.side ?? piece.freeSide;
  const team = pieces.filter((candidate) => (candidate.side ?? candidate.freeSide) === side);
  const enemies = pieces.filter((candidate) => (candidate.side ?? candidate.freeSide) !== side);
  const king = team.find((candidate) => candidate.type === 'king');
  const allyOrbs = Array.isArray(orbs) ? orbs : [];
  const distance = (left, right) => Math.abs(left.r - right.r) + Math.abs(left.c - right.c);
  const nearestDistance = (from, targets) => targets.length
    ? Math.min(...targets.map((target) => distance(from, target)))
    : Infinity;
  const currentOrbDistance = nearestDistance(piece, allyOrbs);
  const botOrbs = allyOrbs.filter((orb) => orb.type === 'bot');
  const currentBotOrbDistance = nearestDistance(piece, botOrbs);
  const currentEnemyDistance = nearestDistance(piece, enemies);
  const currentKingDistance = king ? distance(piece, king) : 0;
  const nearbyThreats = king
    ? enemies.filter((enemy) => distance(enemy, king) <= 3)
    : [];
  const scoreMove = (move) => {
    const destination = { r: move.r, c: move.c };
    const orb = allyOrbs.find((candidate) =>
      candidate.r === move.r && candidate.c === move.c
    );
    const enemy = enemies.find((candidate) =>
      candidate.r === move.r && candidate.c === move.c
    );
    const nextOrbDistance = nearestDistance(destination, allyOrbs);
    const nextBotOrbDistance = nearestDistance(destination, botOrbs);
    const nextEnemyDistance = nearestDistance(destination, enemies);
    const nextKingDistance = king ? distance(destination, king) : 0;
    let score = move.capture || enemy ? 12 : 0;

    if (role === 'collector') {
      score += orb?.type === 'bot' ? 100 : orb ? 55 : 0;
      if (Number.isFinite(currentBotOrbDistance) && Number.isFinite(nextBotOrbDistance)) {
        score += (currentBotOrbDistance - nextBotOrbDistance) * 12;
      } else if (Number.isFinite(currentOrbDistance) && Number.isFinite(nextOrbDistance)) {
        score += (currentOrbDistance - nextOrbDistance) * 8;
      }
    } else if (role === 'strategic') {
      score += orb?.type === 'bot' ? 26 : orb ? 12 : 0;
      if (Number.isFinite(currentOrbDistance) && Number.isFinite(nextOrbDistance)) {
        score += (currentOrbDistance - nextOrbDistance) * 4;
      }
      if (Number.isFinite(currentEnemyDistance) && Number.isFinite(nextEnemyDistance)) {
        score += (currentEnemyDistance - nextEnemyDistance) * 2;
      }
    } else if (role === 'offensive') {
      score += enemy ? 30 : 0;
      if (Number.isFinite(currentEnemyDistance) && Number.isFinite(nextEnemyDistance)) {
        score += (currentEnemyDistance - nextEnemyDistance) * 7;
      }
      score += orb?.type === 'bot' ? 8 : orb ? 3 : 0;
    } else if (role === 'defensive') {
      if (king) {
        score += (currentKingDistance - nextKingDistance) * 6;
        if (nearbyThreats.length) {
          score += nearbyThreats.reduce((value, threat) =>
            value + (distance(destination, threat) < distance(piece, threat) ? 5 : 0), 0);
        }
      }
      score += orb ? 7 : 0;
    } else if (role === 'guardian') {
      if (king) {
        score += (currentKingDistance - nextKingDistance) * 12;
        score += nearbyThreats.reduce((value, threat) =>
          value + (distance(destination, threat) < distance(piece, threat) ? 7 : 0), 0);
      }
      score += orb && nextKingDistance <= 2 ? 8 : 0;
    }

    return score;
  };
  return moves
    .map((move) => ({ move, score: scoreMove(move) }))
    .sort((left, right) =>
      right.score - left.score ||
      left.move.r - right.move.r ||
      left.move.c - right.move.c
    )[0].move;
}

export function generateFreezoneOrbPositions(
  boardSize = FREEZONE_BOARD_SIZE,
  occupiedCells = [],
  count = FREEZONE_ORB_TARGET_COUNT,
  random = Math.random,
  arenaFormat = 'square',
  enabledOrbTypes = null
) {
  const allowedTypes = Array.isArray(enabledOrbTypes)
    ? enabledOrbTypes.filter((type) => FREEZONE_ORB_TYPES.includes(type))
    : null;
  const desired = allowedTypes?.length === 0
    ? 0
    : Math.max(0, Math.min(boardSize * boardSize, Math.floor(count)));
  const positions = [];
  const normalizeOccupiedCell = (cell) => {
    if (!cell && cell !== 0) return null;
    if (typeof cell === 'string') {
      const [row, col] = cell.split(',').map((value) => Number.parseInt(value, 10));
      if (Number.isInteger(row) && Number.isInteger(col)) return [row, col];
      return null;
    }
    if (Array.isArray(cell) && cell.length >= 2) {
      const row = Number(cell[0]);
      const col = Number(cell[1]);
      if (Number.isInteger(row) && Number.isInteger(col)) return [row, col];
      return null;
    }
    if (cell && typeof cell === 'object' && Number.isInteger(cell.r) && Number.isInteger(cell.c)) {
      return [cell.r, cell.c];
    }
    return null;
  };
  const occupied = new Set(
    (Array.isArray(occupiedCells) ? occupiedCells : [])
      .map(normalizeOccupiedCell)
      .filter(Boolean)
      .map(([row, col]) => freezoneOffsetKey(row, col))
  );
  const canPlace = (r, c) => {
    if (!isValidFreezoneCell(r, c, boardSize, arenaFormat) || occupied.has(freezoneOffsetKey(r, c))) return false;
    return positions.every((point) =>
      Math.abs(point.r - r) + Math.abs(point.c - c) >= 2
    );
  };
  const addOrb = (r, c) => {
    const index = positions.length;
    const type = randomFreezoneOrbType(random, allowedTypes);
    if (!type) return;
    occupied.add(freezoneOffsetKey(r, c));
    positions.push({ id: `orb-${index}-${Math.floor(random() * 1e9)}`, r, c, type });
  };
  const divisions = Math.max(1, Math.ceil(Math.sqrt(desired)));
  const sectorSize = Math.ceil(boardSize / divisions);
  for (let sectorR = 0; sectorR < divisions && positions.length < desired; sectorR += 1) {
    for (let sectorC = 0; sectorC < divisions && positions.length < desired; sectorC += 1) {
      const minR = sectorR * sectorSize;
      const minC = sectorC * sectorSize;
      const maxR = Math.min(boardSize, minR + sectorSize);
      const maxC = Math.min(boardSize, minC + sectorSize);
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const r = minR + Math.floor(random() * (maxR - minR));
        const c = minC + Math.floor(random() * (maxC - minC));
        if (!canPlace(r, c)) continue;
        addOrb(r, c);
        break;
      }
    }
  }
  for (let attempt = 0; positions.length < desired && attempt < desired * 120; attempt += 1) {
    const r = Math.floor(random() * boardSize);
    const c = Math.floor(random() * boardSize);
    if (canPlace(r, c)) addOrb(r, c);
  }
  return positions;
}

export function createFreezoneMutantZone(boardSize = FREEZONE_BOARD_SIZE, random = Math.random) {
  const randomInt = (max) => Math.min(max - 1, Math.floor(Math.max(0, random()) * max));
  const shapes = ['diamond', 'triangle', 'circle'];
  return {
    id: `mutant-${random().toString(36).slice(2, 10)}`,
    shape: shapes[randomInt(shapes.length)],
    r: 6 + randomInt(Math.max(1, boardSize - 12)),
    c: 6 + randomInt(Math.max(1, boardSize - 12)),
    radius: 4,
    remainingMs: FREEZONE_MUTANT_DURATION_MS,
    durationMs: FREEZONE_MUTANT_DURATION_MS,
    active: true
  };
}

export function advanceFreezoneMutantZone(zone, elapsedMs) {
  if (!zone?.active || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return zone;
  const remainingMs = Math.max(0, zone.remainingMs - elapsedMs);
  return { ...zone, remainingMs, active: remainingMs > 0 };
}

export function normalizeFreezoneMutantZone(zone, boardSize = FREEZONE_BOARD_SIZE) {
  if (!zone || zone.active !== true || !['diamond', 'triangle', 'circle'].includes(zone.shape) ||
      !Number.isSafeInteger(zone.r) || !Number.isSafeInteger(zone.c) ||
      zone.r < 0 || zone.c < 0 || zone.r >= boardSize || zone.c >= boardSize ||
      !Number.isFinite(zone.remainingMs) || zone.remainingMs <= 0) return null;
  return {
    id: typeof zone.id === 'string' ? zone.id.slice(0, 40) : 'mutant-zone',
    shape: zone.shape,
    r: zone.r,
    c: zone.c,
    radius: Math.max(1, Math.min(12, Math.floor(zone.radius) || 4)),
    remainingMs: Math.min(FREEZONE_MUTANT_DURATION_MS, zone.remainingMs),
    durationMs: FREEZONE_MUTANT_DURATION_MS,
    active: true
  };
}

export function validateFreezoneAudioUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return { ok: false, error: 'Audio URL must be 2048 characters or fewer.' };
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, error: 'Audio URL must use HTTP or HTTPS.' };
    if (url.username || url.password) return { ok: false, error: 'Audio URLs must not contain embedded credentials.' };
    if (url.hash || Array.from(url.searchParams.keys()).some((key) =>
      /(?:token|api[_-]?key|auth|credential|password|secret|signature|(?:^|[_-])key(?:$|[_-]))/i.test(key)
    )) {
      return { ok: false, error: 'Remove credentials or access tokens from the audio URL before sharing it.' };
    }
    return { ok: true, url: url.href };
  } catch {
    return { ok: false, error: 'Enter a valid direct audio URL.' };
  }
}

export function freezoneMusicElapsedSeconds(playing, startedAt, now = Date.now()) {
  if (playing !== true || !Number.isFinite(startedAt) || startedAt <= 0 ||
      !Number.isFinite(now)) return -1;
  return Math.max(0, (now - startedAt) / 1000);
}

export function validateFreezoneThumbnailUrl(value) {
  if (!value) return { ok: true, url: '', error: '' };
  if (typeof value !== 'string' || value.length > 2048) {
    return {
      ok: false,
      url: '',
      error: 'Thumbnail URL must be no longer than 2048 characters.'
    };
  }
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, url: '', error: 'Thumbnail URL must use HTTP or HTTPS.' };
    }
    if (url.username || url.password) {
      return {
        ok: false,
        url: '',
        error: 'Thumbnail URLs must not contain embedded credentials.'
      };
    }
    if (url.hash || Array.from(url.searchParams.keys()).some((key) =>
      /(?:token|api[_-]?key|auth|credential|password|secret|signature|(?:^|[_-])key(?:$|[_-]))/i.test(key)
    )) {
      return {
        ok: false,
        url: '',
        error: 'Remove credentials or access tokens from the thumbnail URL.'
      };
    }
    return { ok: true, url: url.href, error: '' };
  } catch {
    return { ok: false, url: '', error: 'Enter a valid thumbnail URL.' };
  }
}

export function validateFreezoneAudioFile(file) {
  if (!file || !/\.mp3$/i.test(file.name || '') ||
      file.type && file.type !== 'audio/mpeg') {
    return { ok: false, error: 'Choose a valid MP3 audio file.' };
  }
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > 20 * 1024 * 1024) {
    return { ok: false, error: 'MP3 files must be no larger than 20 MB.' };
  }
  return { ok: true };
}
