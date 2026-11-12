export const FREEZONE_BOARD_SIZE = 64;
export const FREEZONE_MUTANT_DURATION_MS = 3 * 60 * 1000;
export const FREEZONE_ORB_TARGET_COUNT = 512;
export const FREEZONE_ENVELOPE_OPTIONS = [
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

export function computeFreezoneMoves(piece, {
  boardSize = FREEZONE_BOARD_SIZE,
  envelopeRows = 3,
  envelopeCols = 3,
  stepsRemaining = 1,
  removedBlocks = [],
  pieces = []
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
      if (r < 0 || c < 0 || r >= boardSize || c >= boardSize ||
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
      if (r < 0 || c < 0 || r >= boardSize || c >= boardSize ||
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

export function freezoneFocusPose(cameraPosition, orbitTarget, pieceTarget, distance = 9.5) {
  const offset = cameraPosition.map((value, index) => value - orbitTarget[index]);
  const magnitude = Math.hypot(...offset);
  const direction = magnitude > 0.01
    ? offset.map((value) => value / magnitude)
    : [0, 0.45, 0.89];
  const scaled = direction.map((value) => value * distance);
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

export function generateFreezoneOrbPositions(
  boardSize = FREEZONE_BOARD_SIZE,
  occupiedCells = [],
  count = FREEZONE_ORB_TARGET_COUNT,
  random = Math.random
) {
  const desired = Math.max(0, Math.min(boardSize * boardSize, Math.floor(count)));
  const positions = [];
  const occupied = new Set(occupiedCells);
  const canPlace = (r, c) => {
    if (occupied.has(freezoneOffsetKey(r, c))) return false;
    return positions.every((point) =>
      Math.abs(point.r - r) + Math.abs(point.c - c) >= 2
    );
  };
  const addOrb = (r, c) => {
    const index = positions.length;
    const roll = random();
    const type = roll < 0.42 ? 'xp'
      : roll < 0.56 ? 'red'
        : roll < 0.70 ? 'blue'
          : roll < 0.82 ? 'yellow'
            : roll < 0.91 ? 'purple'
              : 'white';
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
    return { ok: true, url: url.href };
  } catch {
    return { ok: false, error: 'Enter a valid direct audio URL.' };
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
