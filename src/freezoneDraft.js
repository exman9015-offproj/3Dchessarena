import { FREEZONE_ORB_TYPES, isValidFreezoneCell } from './freezoneRules.js';

export const FREEZONE_EDITOR_DRAFT_VERSION = 1;
export const FREEZONE_EDITOR_DRAFT_STORAGE_KEY = 'wizard-chess.freezone-editor-draft.v1';
export const FREEZONE_SCENE_LAYOUT_VERSION = 1;
export const FREEZONE_SCENE_LAYOUT_ORB_LIMIT = 256;

const FREEZONE_DRAFT_BOARD_SIZE = 32;
const DEFAULT_BOUNDS = { width: 32, depth: 32, height: 6 };
const TERRAIN_KINDS = new Set(['floor', 'wall', 'erase']);

/** @typedef {'square' | 'triangle' | 'hexagonal'} FreezoneDraftArenaFormat */
/** @typedef {'floor' | 'wall' | 'erase'} FreezoneDraftTerrainKind */
/**
 * @typedef {object} FreezoneDraftTerrainChange
 * @property {number} r
 * @property {number} c
 * @property {number} level
 * @property {string} [type]
 * @property {FreezoneDraftTerrainKind} kind
 * @property {string} [color]
 * @property {number} [rotationX]
 * @property {number} [rotationZ]
 */
/**
 * @typedef {object} FreezoneDraftOrb
 * @property {string} id
 * @property {number} r
 * @property {number} c
 * @property {number} level
 */
/**
 * @typedef {object} FreezoneEditorDraft
 * @property {number} version
 * @property {FreezoneDraftArenaFormat} arenaFormat
 * @property {FreezoneDraftTerrainChange[]} terrainChanges
 * @property {FreezoneDraftOrb[]} draftOrbs
 * @property {{width: number, depth: number, height: number}} boundsSize
 * @property {number} platformSize
 * @property {number} terrainLevel
 * @property {string} terrainColor
 * @property {'move' | 'scale'} gizmoMode
 */
/**
 * @typedef {object} FreezoneSceneLayout
 * @property {number} version
 * @property {FreezoneDraftTerrainChange[]} terrainChanges
 * @property {FreezoneDraftOrb[]} orbs
 */

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * @param {unknown} change
 * @returns {FreezoneDraftTerrainChange | null}
 */
function normalizeTerrainChange(change) {
  if (!change || typeof change !== 'object' ||
      !isIntegerInRange(change.r, 0, FREEZONE_DRAFT_BOARD_SIZE - 1) ||
      !isIntegerInRange(change.c, 0, FREEZONE_DRAFT_BOARD_SIZE - 1) ||
      !isIntegerInRange(change.level, -3, 3) ||
      !TERRAIN_KINDS.has(change.kind)) return null;
  const normalized = {
    r: change.r,
    c: change.c,
    level: change.level,
    kind: change.kind
  };
  if (typeof change.color === 'string' && /^#[\da-f]{6}$/i.test(change.color)) {
    normalized.color = change.color.toLowerCase();
  }
  for (const axis of ['rotationX', 'rotationZ']) {
    const rotation = change[axis];
    if (Number.isInteger(rotation) && rotation >= 0 && rotation < 360 && rotation % 90 === 0) {
      normalized[axis] = rotation;
    }
  }
  return normalized;
}

/**
 * @param {unknown} orb
 * @returns {FreezoneDraftOrb | null}
 */
function normalizeDraftOrb(orb) {
  if (!orb || typeof orb !== 'object' ||
      typeof orb.id !== 'string' || !orb.id.trim() || orb.id.length > 100 ||
      !isIntegerInRange(orb.r, 0, FREEZONE_DRAFT_BOARD_SIZE - 1) ||
      !isIntegerInRange(orb.c, 0, FREEZONE_DRAFT_BOARD_SIZE - 1) ||
      !isIntegerInRange(orb.level, -3, 3) ||
      orb.type !== undefined && !FREEZONE_ORB_TYPES.includes(orb.type)) return null;
  return {
    id: orb.id.trim(),
    r: orb.r,
    c: orb.c,
    level: orb.level,
    type: orb.type || 'xp'
  };
}

function normalizeBound(value, min, max, fallback) {
  return isIntegerInRange(value, min, max) ? value : fallback;
}

/**
 * Validate untrusted local storage data before it is applied to the scene.
 * @param {unknown} value
 * @returns {FreezoneEditorDraft | null}
 */
export function normalizeFreezoneEditorDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw.version !== undefined && raw.version !== FREEZONE_EDITOR_DRAFT_VERSION) return null;
  const format = /** @type {FreezoneDraftArenaFormat} */ (raw.arenaFormat === 'triangle' || raw.arenaFormat === 'hexagonal'
    ? raw.arenaFormat
    : 'square');
  const terrainChanges = Array.isArray(raw.terrainChanges)
    ? raw.terrainChanges
      .slice(0, FREEZONE_DRAFT_BOARD_SIZE * FREEZONE_DRAFT_BOARD_SIZE * 7)
      .map(normalizeTerrainChange)
      .filter((change) => change !== null)
    : [];
  const uniqueChanges = new Map(
    terrainChanges.map((change) => [`${change.r},${change.c},${change.level}`, change])
  );
  const draftOrbs = Array.isArray(raw.draftOrbs)
    ? raw.draftOrbs.slice(0, 2048).map(normalizeDraftOrb).filter((orb) => orb !== null)
    : [];
  const uniqueOrbs = new Map(draftOrbs.map((orb) => [orb.id, orb]));
  const bounds = raw.boundsSize && typeof raw.boundsSize === 'object'
    ? /** @type {Record<string, unknown>} */ (raw.boundsSize)
    : {};
  const terrainColor = typeof raw.terrainColor === 'string' && /^#[\da-f]{6}$/i.test(raw.terrainColor)
    ? raw.terrainColor.toLowerCase()
    : '#d4af37';

  return {
    version: FREEZONE_EDITOR_DRAFT_VERSION,
    arenaFormat: format,
    terrainChanges: [...uniqueChanges.values()],
    draftOrbs: [...uniqueOrbs.values()],
    boundsSize: {
      width: normalizeBound(bounds.width, 4, 128, DEFAULT_BOUNDS.width),
      depth: normalizeBound(bounds.depth, 4, 128, DEFAULT_BOUNDS.depth),
      height: normalizeBound(bounds.height, 2, 48, DEFAULT_BOUNDS.height)
    },
    platformSize: normalizeBound(raw.platformSize, 1, FREEZONE_DRAFT_BOARD_SIZE, 9),
    terrainLevel: normalizeBound(raw.terrainLevel, -3, 3, 0),
    terrainColor,
    gizmoMode: raw.gizmoMode === 'scale' ? 'scale' : 'move'
  };
}

/**
 * @param {{getItem: (key: string) => string | null}} storage
 * @returns {{draft: FreezoneEditorDraft | null, blocked: boolean, message: string}}
 */
export function readFreezoneEditorDraft(storage) {
  try {
    const stored = storage.getItem(FREEZONE_EDITOR_DRAFT_STORAGE_KEY);
    if (!stored) return { draft: null, blocked: false, message: 'No saved scene draft yet.' };
    if (stored.length > 2_000_000) {
      return {
        draft: null,
        blocked: true,
        message: 'The saved scene draft is too large; it was left untouched.'
      };
    }
    const draft = normalizeFreezoneEditorDraft(JSON.parse(stored));
    if (!draft) {
      return {
        draft: null,
        blocked: true,
        message: 'The saved scene draft is invalid or from a newer version; it was left untouched.'
      };
    }
    return { draft, blocked: false, message: 'Restored the local scene draft.' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'browser storage is unavailable';
    return {
      draft: null,
      blocked: true,
      message: `Could not read the local scene draft: ${reason}`
    };
  }
}

/**
 * @param {{setItem: (key: string, value: string) => void}} storage
 * @param {unknown} value
 * @returns {{ok: true} | {ok: false, message: string}}
 */
export function writeFreezoneEditorDraft(storage, value) {
  const draft = normalizeFreezoneEditorDraft(value);
  if (!draft) return { ok: false, message: 'The local scene draft is invalid.' };
  try {
    const serialized = JSON.stringify(draft);
    if (serialized.length > 2_000_000) {
      return { ok: false, message: 'The local scene draft exceeds the storage size limit.' };
    }
    storage.setItem(FREEZONE_EDITOR_DRAFT_STORAGE_KEY, serialized);
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'browser storage is unavailable';
    return { ok: false, message: `Could not save the local scene draft: ${reason}` };
  }
}

/**
 * Only the single-level layout currently supported by the game engine may be published.
 * @param {unknown} value
 * @param {number} boardSize
 * @param {string} arenaFormat
 * @param {{enabledOrbTypes?: string[]}} [options]
 * @returns {{ok: true, layout: FreezoneSceneLayout | null} | {ok: false, error: string}}
 */
export function validateFreezoneSceneLayout(value, boardSize = 32, arenaFormat = 'square', options = {}) {
  if (value == null) return { ok: true, layout: null };
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      boardSize !== 32) {
    return { ok: false, error: 'The published Freezone layout has an invalid shape or board size.' };
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw.version !== FREEZONE_SCENE_LAYOUT_VERSION) {
    return { ok: false, error: 'The published Freezone layout version is not supported.' };
  }
  if (raw.boundsSize && typeof raw.boundsSize === 'object') {
    const bounds = /** @type {Record<string, unknown>} */ (raw.boundsSize);
    if (bounds.width !== boardSize || bounds.depth !== boardSize || bounds.height !== 6) {
      return {
        ok: false,
        error: 'Custom volume dimensions are still preview-only; restore the standard 32×32×6 volume before publishing.'
      };
    }
  }
  if (!Array.isArray(raw.terrainChanges) || raw.terrainChanges.length > boardSize * boardSize) {
    return { ok: false, error: 'The published layout has too many or invalid terrain tiles.' };
  }
  const terrainChanges = [];
  const changeKeys = new Set();
  for (const rawChange of raw.terrainChanges) {
    if (!rawChange || typeof rawChange !== 'object' ||
        (rawChange.color !== undefined &&
          (typeof rawChange.color !== 'string' || !/^#[\da-f]{6}$/i.test(rawChange.color))) ||
        (rawChange.rotationX !== undefined && rawChange.rotationX !== 0) ||
        (rawChange.rotationZ !== undefined && rawChange.rotationZ !== 0)) {
      return {
        ok: false,
        error: 'Published terrain colors or rotations are invalid.'
      };
    }
    const change = normalizeTerrainChange(rawChange);
    if (!change || change.level !== 0 ||
        !isValidFreezoneCell(change.r, change.c, boardSize, arenaFormat) ||
        (change.rotationX !== undefined && change.rotationX !== 0) ||
        (change.rotationZ !== undefined && change.rotationZ !== 0)) {
      return {
        ok: false,
        error: 'Only unrotated ground-level tiles inside the selected arena can be published. Elevated terrain remains a local preview.'
      };
    }
    const key = `${change.r},${change.c}`;
    if (changeKeys.has(key)) {
      return { ok: false, error: 'The published layout contains duplicate terrain tiles.' };
    }
    changeKeys.add(key);
    terrainChanges.push(change);
  }
  const blockedCells = new Set(terrainChanges
    .filter((change) => change.kind === 'erase' || change.kind === 'wall')
    .map((change) => `${change.r},${change.c}`));
  if ((raw.orbs !== undefined && !Array.isArray(raw.orbs)) ||
      (raw.orbs === undefined && raw.draftOrbs !== undefined && !Array.isArray(raw.draftOrbs))) {
    return { ok: false, error: 'The published layout has an invalid custom orb list.' };
  }
  const rawOrbs = Array.isArray(raw.orbs)
    ? raw.orbs
    : Array.isArray(raw.draftOrbs) ? raw.draftOrbs : [];
  const enabledOrbTypes = Array.isArray(options.enabledOrbTypes)
    ? options.enabledOrbTypes
    : FREEZONE_ORB_TYPES;
  if (rawOrbs.length > FREEZONE_SCENE_LAYOUT_ORB_LIMIT) {
    return {
      ok: false,
      error: `A published layout can contain at most ${FREEZONE_SCENE_LAYOUT_ORB_LIMIT} custom orbs.`
    };
  }
  const orbs = [];
  const orbIds = new Set();
  const orbCells = new Set();
  for (const rawOrb of rawOrbs) {
    const orb = normalizeDraftOrb(rawOrb);
    if (!orb || orb.level !== 0 || !isValidFreezoneCell(orb.r, orb.c, boardSize, arenaFormat)) {
      return {
        ok: false,
        error: 'Only custom orbs on valid ground-level arena tiles can be published.'
      };
    }
    if (!enabledOrbTypes.includes(orb.type)) {
      return {
        ok: false,
        error: `The ${orb.type} orb is disabled in this arena.`
      };
    }
    const cellKey = `${orb.r},${orb.c}`;
    if (orbIds.has(orb.id) || orbCells.has(cellKey) || blockedCells.has(cellKey)) {
      return {
        ok: false,
        error: 'Custom orbs must have unique ids and occupy distinct, walkable tiles.'
      };
    }
    orbIds.add(orb.id);
    orbCells.add(cellKey);
    orbs.push(orb);
  }
  return {
    ok: true,
    layout: {
      version: FREEZONE_SCENE_LAYOUT_VERSION,
      terrainChanges,
      orbs
    }
  };
}
