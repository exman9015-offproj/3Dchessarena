import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { listGameModes, saveGameMode } from './multiplayerSupabase.js';
import FreezoneArenaPreview, {
  type FreezoneDraftOrb,
  type FreezoneTerrainChange,
  type FreezoneTerrainTool
} from './FreezoneArenaPreview';
import {
  FREEZONE_ARENA_FORMATS,
  FREEZONE_ROOM_TAGS,
  normalizeFreezoneArenaFormat,
  normalizeFreezoneRoomPublication,
  normalizeFreezoneRoomTheme
} from './freezoneCustomization.js';
import {
  normalizeFreezoneEditorDraft,
  readFreezoneEditorDraft,
  validateFreezoneSceneLayout,
  writeFreezoneEditorDraft
} from './freezoneDraft.js';
import {
  computeFreezoneMoves,
  getFreezoneEffectiveMovementEnvelope,
  getFreezoneArenaCells,
  getFreezoneDraftPlayableLevels,
  getFreezoneTerrainScaleKeys,
  isValidFreezoneCell,
  normalizeFreezoneMovementLimits,
  normalizeFreezoneOrbSettings,
  normalizeFreezonePieceCooldowns,
  normalizeFreezoneTileGeometry,
  FREEZONE_MAX_MOVEMENT_RANGE,
  FREEZONE_MAX_PIECE_COOLDOWN_MS,
  FREEZONE_ORB_TYPES,
  FREEZONE_PIECE_TYPES,
  FREEZONE_TILE_GEOMETRIES,
  validateFreezoneThumbnailUrl
} from './freezoneRules.js';

type Side = number;
type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
type FreezoneArenaFormat = 'square' | 'triangle' | 'hexagonal';
type MoveOffset = [number, number];
export type CustomPiece = {
  id: string;
  side: Side;
  type: PieceType;
  r: number;
  c: number;
  moves: MoveOffset[];
  jumps?: MoveOffset[];
  slide: boolean;
};
type PreviewTestPiece = CustomPiece & { level: number };
export type CustomSpawnPoint = { side: Side; r: number; c: number };
export type CustomGameMode = {
  version: 1;
  boardSize: number;
  playerCount: number;
  gameMode: 'turn-based' | 'freezone';
  piecesPerPlayer: number;
  movesPerTurn: number;
  allowPieceSelection: boolean;
  allowedPieceTypes: PieceType[];
  pieces: CustomPiece[];
  randomSpawn?: boolean;
  spawnPoints?: CustomSpawnPoint[];
  arenaFormat?: FreezoneArenaFormat;
  floorTileGeometry?: string;
  orbSettings?: { enabledTypes: string[]; xpByType: Record<string, number> };
  movementLimits?: Record<string, { rows: number; cols: number }>;
  pieceCooldownMs?: Record<string, number>;
  arenaName?: string;
  publication?: {
    version: number;
    name: string;
    description: string;
    thumbnailUrl: string;
    wallpaperUrl?: string;
    tags: string[];
    theme?: {
      surface: string;
      edge: string;
      team: string;
      wallpaperUrl?: string;
    };
  };
  sceneLayout?: {
    version: number;
    terrainChanges: FreezoneTerrainChange[];
    orbs: FreezoneDraftOrb[];
  } | null;
};
type SavedMode = { id: string; name: string; config: CustomGameMode };
type Props = {
  open: boolean;
  onClose: () => void;
  onStart: (config: CustomGameMode, multiplayer: boolean) => void;
};

const SIDES = [
  { name: 'White', color: '#f5eee0', forward: [-1, 0] as MoveOffset },
  { name: 'Black', color: '#d4af37', forward: [1, 0] as MoveOffset },
  { name: 'Red', color: '#e65b55', forward: [0, -1] as MoveOffset },
  { name: 'Blue', color: '#559ce3', forward: [0, 1] as MoveOffset },
  { name: 'Green', color: '#59bd70', forward: [-1, 0] as MoveOffset },
  { name: 'Orange', color: '#e6973f', forward: [1, 0] as MoveOffset },
  { name: 'Purple', color: '#a66be0', forward: [0, -1] as MoveOffset },
  { name: 'Cyan', color: '#4cc8c7', forward: [0, 1] as MoveOffset },
  { name: 'Magenta', color: '#db5aab', forward: [-1, 0] as MoveOffset },
  { name: 'Yellow', color: '#d6c941', forward: [1, 0] as MoveOffset }
];
const PIECES: { type: PieceType; name: string; symbol: string }[] = [
  { type: 'pawn', name: 'Pawn', symbol: 'P' },
  { type: 'rook', name: 'Rook', symbol: 'R' },
  { type: 'knight', name: 'Knight', symbol: 'N' },
  { type: 'bishop', name: 'Bishop', symbol: 'B' },
  { type: 'queen', name: 'Queen', symbol: 'Q' },
  { type: 'king', name: 'King', symbol: 'K' }
];
const ABILITY_RADIUS = FREEZONE_MAX_MOVEMENT_RANGE;
const PREVIEW_SIZE = 620;
const ORB_LABELS: Record<string, string> = {
  xp: 'XP',
  red: 'Red',
  blue: 'Blue',
  yellow: 'Yellow',
  purple: 'Purple',
  white: 'White',
  bot: 'Bot',
  movement: 'Movement'
};

function defaultMoves(type: PieceType, forward: MoveOffset): MoveOffset[] {
  if (type === 'pawn') return [[...forward]];
  if (type === 'knight') return [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  if (type === 'rook') return [[-1, 0], [1, 0], [0, -1], [0, 1]];
  if (type === 'bishop') return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  if (type === 'queen') return [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  return [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
}

function normalizeCreatorConfig(modeConfig: CustomGameMode): CustomGameMode {
  const arenaFormat = normalizeFreezoneArenaFormat(modeConfig.arenaFormat);
  return {
    ...modeConfig,
    arenaFormat,
    floorTileGeometry: normalizeFreezoneTileGeometry(modeConfig.floorTileGeometry, arenaFormat),
    orbSettings: normalizeFreezoneOrbSettings(modeConfig.orbSettings),
    movementLimits: normalizeFreezoneMovementLimits(modeConfig.movementLimits),
    pieceCooldownMs: normalizeFreezonePieceCooldowns(modeConfig.pieceCooldownMs)
  };
}

function freshConfig(): CustomGameMode {
  return {
    version: 1,
    boardSize: 8,
    playerCount: 2,
    gameMode: 'turn-based',
    piecesPerPlayer: 1,
    movesPerTurn: 1,
    allowPieceSelection: false,
    allowedPieceTypes: PIECES.map(({ type }) => type),
    pieces: [],
    randomSpawn: true,
    spawnPoints: [],
    arenaFormat: 'square',
    floorTileGeometry: 'square',
    orbSettings: normalizeFreezoneOrbSettings(null),
    movementLimits: normalizeFreezoneMovementLimits(null),
    pieceCooldownMs: normalizeFreezonePieceCooldowns(null),
    publication: {
      version: 1,
      name: '',
      description: '',
      thumbnailUrl: '',
      wallpaperUrl: '',
      tags: [],
      theme: {
        surface: '#dcd3c2',
        edge: '#14171f',
        team: '#d4af37',
        wallpaperUrl: ''
      }
    }
  };
}

function readFreezoneEditorDraftFromStorage() {
  return readFreezoneEditorDraft(window.localStorage);
}

export default function ModeCreator({ open, onClose, onStart }: Props) {
  const [restoredEditorDraft] = useState(readFreezoneEditorDraftFromStorage);
  const [config, setConfig] = useState<CustomGameMode>(() => {
    const initial = freshConfig();
    if (restoredEditorDraft.draft) {
      initial.arenaFormat = restoredEditorDraft.draft.arenaFormat;
    }
    return initial;
  });
  const [activeSide, setActiveSide] = useState<Side>(0);
  const [pieceType, setPieceType] = useState<PieceType>('pawn');
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [modeName, setModeName] = useState('');
  const [savedModes, setSavedModes] = useState<SavedMode[]>([]);
  const [status, setStatus] = useState(restoredEditorDraft.message);
  const [draftStorageStatus, setDraftStorageStatus] = useState(restoredEditorDraft.message);
  const [draftStorageEnabled, setDraftStorageEnabled] = useState(!restoredEditorDraft.blocked);
  const [saving, setSaving] = useState(false);
  const [boardTool, setBoardTool] = useState<'pieces' | 'spawn' | 'move'>('pieces');
  const [previewTool, setPreviewTool] = useState<FreezoneTerrainTool>('pieces');
  const [selectedOrbType, setSelectedOrbType] = useState('xp');
  const [terrainLevel, setTerrainLevel] = useState(restoredEditorDraft.draft?.terrainLevel ?? 0);
  const [terrainColor, setTerrainColor] = useState(restoredEditorDraft.draft?.terrainColor ?? '#d4af37');
  const [platformSize, setPlatformSize] = useState(restoredEditorDraft.draft?.platformSize ?? 9);
  const [gizmoMode, setGizmoMode] = useState<'move' | 'scale'>(restoredEditorDraft.draft?.gizmoMode ?? 'move');
  const [boundsSize, setBoundsSize] = useState(restoredEditorDraft.draft?.boundsSize ?? { width: 32, depth: 32, height: 6 });
  const [terrainChanges, setTerrainChanges] = useState<FreezoneTerrainChange[]>(restoredEditorDraft.draft?.terrainChanges ?? []);
  const [draftOrbs, setDraftOrbs] = useState<FreezoneDraftOrb[]>(restoredEditorDraft.draft?.draftOrbs ?? []);
  const [selectedTerrainKeys, setSelectedTerrainKeys] = useState<string[]>([]);
  const [immersivePreview, setImmersivePreview] = useState(false);
  const [playtestMode, setPlaytestMode] = useState(false);
  const [playtestPiece, setPlaytestPiece] = useState<PreviewTestPiece | null>(null);
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const abilityCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectedPiece = useMemo(
    () => config.pieces.find((piece) => piece.id === selectedPieceId) || null,
    [config.pieces, selectedPieceId]
  );
  const activeOrbTypes = config.orbSettings?.enabledTypes || FREEZONE_ORB_TYPES;
  const visibleSides = SIDES.slice(0, config.playerCount);
  const freezoneSide = 32;
  const sidePieceCount = config.pieces.filter((piece) => piece.side === activeSide).length;
  const activeSpawnPoint = config.spawnPoints?.find((point) => point.side === activeSide);
  const playtestMoves = useMemo(() => {
    if (!playtestMode || !playtestPiece) return [];
    const format = normalizeFreezoneArenaFormat(config.arenaFormat);
    const arenaCells = getFreezoneArenaCells(freezoneSide, format);
    const playableLevels = getFreezoneDraftPlayableLevels(freezoneSide, format, terrainChanges);
    const movementEnvelope = getFreezoneEffectiveMovementEnvelope(
      FREEZONE_MAX_MOVEMENT_RANGE,
      FREEZONE_MAX_MOVEMENT_RANGE,
      config.movementLimits?.[playtestPiece.type]
    );
    const removedBlocks = arenaCells
      .filter((cell) => !playableLevels.has(`${cell.r},${cell.c}`))
      .map((cell) => [cell.r, cell.c] as [number, number]);
    const legalMoves = computeFreezoneMoves(playtestPiece, {
      boardSize: freezoneSide,
      envelopeRows: movementEnvelope.rows,
      envelopeCols: movementEnvelope.cols,
      stepsRemaining: 10,
      removedBlocks,
      pieces: [],
      arenaFormat: format
    });
    return legalMoves.map((move) => ({
      ...move,
      level: Math.max(...(playableLevels.get(`${move.r},${move.c}`) || [0]))
    }));
  }, [config.arenaFormat, config.movementLimits, freezoneSide, playtestMode, playtestPiece, terrainChanges]);
  useEffect(() => {
    if (activeOrbTypes.length && !activeOrbTypes.includes(selectedOrbType)) {
      setSelectedOrbType(activeOrbTypes[0]);
    }
  }, [activeOrbTypes, selectedOrbType]);
  const editorDraft = useMemo(() => normalizeFreezoneEditorDraft({
    arenaFormat: normalizeFreezoneArenaFormat(config.arenaFormat),
    terrainChanges,
    draftOrbs,
    boundsSize,
    platformSize,
    terrainLevel,
    terrainColor,
    gizmoMode
  }), [
    boundsSize,
    config.arenaFormat,
    draftOrbs,
    gizmoMode,
    platformSize,
    terrainChanges,
    terrainColor,
    terrainLevel
  ]);

  const saveEditorDraft = (explicit = false) => {
    if (!editorDraft) return;
    if (!draftStorageEnabled && !explicit) return;
    const result = writeFreezoneEditorDraft(window.localStorage, editorDraft);
    if (result.ok) {
      setDraftStorageEnabled(true);
      setDraftStorageStatus('Local 3D draft saved on this device.');
    } else {
      setDraftStorageStatus(result.message);
    }
  };

  useEffect(() => {
    if (!draftStorageEnabled || !editorDraft) return undefined;
    const timer = window.setTimeout(() => {
      const result = writeFreezoneEditorDraft(window.localStorage, editorDraft);
      if (result.ok) {
        setDraftStorageStatus('Local 3D draft saved on this device.');
      } else {
        setDraftStorageStatus(result.message);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftStorageEnabled, editorDraft]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    listGameModes()
      .then((modes: SavedMode[]) => {
        if (active) setSavedModes(modes);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : '';
        setStatus(message.includes('free_game_modes') || message.includes('schema cache')
          ? 'Shared saved presets are unavailable because public.free_game_modes is not installed. Freezone room creation is separate.'
          : message || 'Could not load shared modes.');
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (activeSide >= config.playerCount) setActiveSide(0);
    if (selectedPiece && selectedPiece.side >= config.playerCount) setSelectedPieceId('');
  }, [config.playerCount, activeSide, selectedPiece]);

  useEffect(() => {
    const canvas = boardCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cell = PREVIEW_SIZE / config.boardSize;
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    for (let r = 0; r < config.boardSize; r++) {
      for (let c = 0; c < config.boardSize; c++) {
        if (config.gameMode === 'freezone' &&
            !isValidFreezoneCell(r, c, freezoneSide, config.arenaFormat)) {
          ctx.fillStyle = '#090b10';
          ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
          continue;
        }
        ctx.fillStyle = (r + c) % 2 ? '#20232b' : '#ded5c4';
        ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
      }
    }
    for (const piece of config.pieces) {
      if (config.gameMode === 'freezone' &&
          !isValidFreezoneCell(piece.r, piece.c, freezoneSide, config.arenaFormat)) continue;
      const x = (piece.c + 0.5) * cell;
      const y = (piece.r + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, Math.min(16, cell * 0.36)), 0, Math.PI * 2);
      ctx.fillStyle = SIDES[piece.side].color;
      ctx.fill();
      if (piece.id === selectedPieceId) {
        ctx.strokeStyle = '#42d4ff';
        ctx.lineWidth = Math.max(2, cell * 0.07);
        ctx.stroke();
      }
      if (cell >= 10) {
        ctx.fillStyle = '#151515';
        ctx.font = `bold ${Math.max(7, Math.min(12, cell * 0.45))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(PIECES.find((entry) => entry.type === piece.type)?.symbol || '?', x, y);
      }
    }
    for (const point of config.spawnPoints || []) {
      if (config.gameMode === 'freezone' &&
          !isValidFreezoneCell(point.r, point.c, freezoneSide, config.arenaFormat)) continue;
      const x = (point.c + 0.5) * cell;
      const y = (point.r + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(5, Math.min(18, cell * 0.44)), 0, Math.PI * 2);
      ctx.strokeStyle = '#67e8a5';
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.stroke();
      if (cell >= 10) {
        ctx.fillStyle = '#155b3a';
        ctx.font = `bold ${Math.max(7, Math.min(12, cell * 0.45))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(point.side + 1), x, y);
      }
    }
  }, [config, freezoneSide, selectedPieceId]);

  useEffect(() => {
    const canvas = abilityCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const count = ABILITY_RADIUS * 2 + 1;
    const cell = PREVIEW_SIZE / count;
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    const movementLimit = selectedPiece
      ? config.movementLimits?.[selectedPiece.type] ||
        { rows: FREEZONE_MAX_MOVEMENT_RANGE, cols: FREEZONE_MAX_MOVEMENT_RANGE }
      : { rows: FREEZONE_MAX_MOVEMENT_RANGE, cols: FREEZONE_MAX_MOVEMENT_RANGE };
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        const outsideLimit = Math.abs(ABILITY_RADIUS - r) > movementLimit.rows ||
          Math.abs(c - ABILITY_RADIUS) > movementLimit.cols;
        ctx.fillStyle = outsideLimit ? '#101217' : (r + c) % 2 ? '#242934' : '#151a23';
        ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
      }
    }
    const center = ABILITY_RADIUS;
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(center * cell, center * cell, cell, cell);
    for (const [index, [dr, dc]] of (selectedPiece?.moves || []).entries()) {
      const r = center - dr;
      const c = center + dc;
      if (r < 0 || r >= count || c < 0 || c >= count) continue;
      const isJump = selectedPiece?.jumps?.some(([jr, jc]) => jr === dr && jc === dc);
      ctx.fillStyle = isJump ? '#32c779' : '#4ea8de';
      ctx.fillRect(c * cell + 2, r * cell + 2, cell - 4, cell - 4);
      ctx.fillStyle = '#081018';
      ctx.font = `bold ${Math.max(8, Math.min(17, cell * 0.48))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), (c + 0.5) * cell, (r + 0.5) * cell);
    }
  }, [config.movementLimits, selectedPiece]);

  if (!open) return null;

  const handleBoardCellClick = (r: number, c: number) => {
    if (config.gameMode === 'freezone' &&
        !isValidFreezoneCell(r, c, freezoneSide, config.arenaFormat)) {
      setStatus('That position is outside this arena format.');
      return;
    }
    if (config.gameMode === 'freezone' && boardTool === 'move') {
      if (!selectedPiece) {
        setStatus('Select a piece before moving it.');
        return;
      }
      const occupant = config.pieces.find((piece) => piece.r === r && piece.c === c);
      if (occupant && occupant.id !== selectedPiece.id) {
        setStatus('That tile is already occupied by another piece.');
        return;
      }
      setConfig((current) => ({
        ...current,
        pieces: current.pieces.map((piece) =>
          piece.id === selectedPiece.id ? { ...piece, r, c } : piece
        )
      }));
      setStatus(`Moved ${SIDES[selectedPiece.side].name} ${selectedPiece.type} to ${r + 1}, ${c + 1}.`);
      return;
    }
    if (config.gameMode === 'freezone' && !config.randomSpawn && boardTool === 'spawn') {
      setConfig((current) => ({
        ...current,
        spawnPoints: [
          ...(current.spawnPoints || []).filter((point) => point.side !== activeSide),
          { side: activeSide, r, c }
        ]
      }));
      setStatus(`${SIDES[activeSide].name} spawn point set to ${r + 1}, ${c + 1}.`);
      return;
    }
    const existing = config.pieces.find((piece) => piece.r === r && piece.c === c);
    if (existing) {
      setSelectedPieceId(existing.id);
      setActiveSide(existing.side);
      setPieceType(existing.type);
      return;
    }
    if (!config.allowedPieceTypes.includes(pieceType)) {
      setStatus(`${pieceType} is not allowed in this mode.`);
      return;
    }
    if (sidePieceCount >= config.piecesPerPlayer) {
      setStatus(`${SIDES[activeSide].name} has reached the ${config.piecesPerPlayer}-piece limit.`);
      return;
    }
    const piece: CustomPiece = {
      id: crypto.randomUUID(),
      side: activeSide,
      type: pieceType,
      r,
      c,
      moves: defaultMoves(pieceType, SIDES[activeSide].forward),
      jumps: [],
      slide: ['rook', 'bishop', 'queen'].includes(pieceType)
    };
    setConfig((current) => ({ ...current, pieces: [...current.pieces, piece] }));
    setSelectedPieceId(piece.id);
  };

  const handleBoardClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const c = Math.floor(((event.clientX - bounds.left) / bounds.width) * config.boardSize);
    const r = Math.floor(((event.clientY - bounds.top) / bounds.height) * config.boardSize);
    handleBoardCellClick(r, c);
  };

  const handleTerrainCellClick = (
    r: number,
    c: number,
    level: number,
    tool: FreezoneTerrainTool
  ) => {
    if (tool === 'pieces' || tool === 'select') return;
    if (tool === 'orb') {
      if (draftOrbs.length >= 2048) {
        setStatus('This scene draft has reached the 2,048-orb preview limit.');
        return;
      }
      setDraftOrbs((current) => [
        ...current,
        { id: crypto.randomUUID(), r, c, level, type: selectedOrbType }
      ]);
      setStatus(`Placed a ${ORB_LABELS[selectedOrbType]} orb at ${r + 1}, ${c + 1}, level ${level}.`);
      return;
    }
    if (tool === 'paint') {
      const existing = terrainChanges.find((change) =>
        change.r === r && change.c === c && change.level === level
      );
      if (existing?.kind === 'erase' || existing?.kind === 'wall' ||
          (level !== 0 && existing?.kind !== 'floor')) {
        setStatus('Paint can only be applied to an existing floor tile.');
        return;
      }
      setTerrainChanges((current) => [
        ...current.filter((change) =>
          change.r !== r || change.c !== c || change.level !== level
        ),
        { ...(existing || { r, c, level, kind: 'floor' as const }), color: terrainColor }
      ]);
      setStatus(`Painted tile at ${r + 1}, ${c + 1}, level ${level}.`);
      return;
    }
    const kind = tool === 'erase' ? 'erase' : tool;
    if (tool === 'erase') {
      setDraftOrbs((current) => current.filter((orb) =>
        orb.r !== r || orb.c !== c || orb.level !== level
      ));
    }
    setTerrainChanges((current) => [
      ...current.filter((change) =>
        change.r !== r || change.c !== c || change.level !== level
      ),
      { r, c, level, kind }
    ]);
    setStatus(tool === 'erase'
      ? `Removed the terrain at ${r + 1}, ${c + 1}, level ${level}.`
      : `Added ${kind} at ${r + 1}, ${c + 1}, level ${level}.`);
  };

  const getPreviewAreaCells = () => {
    const format = normalizeFreezoneArenaFormat(config.arenaFormat);
    const start = Math.floor((freezoneSide - platformSize) / 2);
    return getFreezoneArenaCells(freezoneSide, format).filter((cell) =>
      cell.r >= start && cell.r < start + platformSize &&
      cell.c >= start && cell.c < start + platformSize
    );
  };

  const fillPreviewPlatform = () => {
    const cells = getPreviewAreaCells();
    setTerrainChanges((current) => [
      ...current.filter((change) => !(
        change.level === terrainLevel &&
        cells.some((cell) => cell.r === change.r && cell.c === change.c)
      )),
      ...cells.map(({ r, c }) => ({
        r,
        c,
        level: terrainLevel,
        kind: 'floor' as const,
        color: terrainColor
      }))
    ]);
    setPreviewTool('floor');
    setStatus(`Added an ${platformSize}×${platformSize} platform (${cells.length} valid tiles) at level ${terrainLevel}.`);
  };

  const erasePreviewArea = () => {
    const cells = getPreviewAreaCells();
    setTerrainChanges((current) => [
      ...current.filter((change) => !(
        change.level === terrainLevel &&
        cells.some((cell) => cell.r === change.r && cell.c === change.c)
      )),
      ...cells.map(({ r, c }) => ({
        r,
        c,
        level: terrainLevel,
        kind: 'erase' as const
      }))
    ]);
    setDraftOrbs((current) => current.filter((orb) => !(
      orb.level === terrainLevel &&
      cells.some((cell) => cell.r === orb.r && cell.c === orb.c)
    )));
    setPreviewTool('erase');
    setStatus(`Erased an ${platformSize}×${platformSize} area (${cells.length} valid tiles) at level ${terrainLevel}.`);
  };

  const selectPreviewArea = () => {
    const cells = getPreviewAreaCells().filter((cell) => {
      const change = terrainChanges.find((candidate) =>
        candidate.r === cell.r && candidate.c === cell.c && candidate.level === terrainLevel
      );
      return terrainLevel === 0
        ? change?.kind !== 'erase' && change?.kind !== 'wall'
        : change?.kind === 'floor';
    });
    setSelectedTerrainKeys(cells.map(({ r, c }) => `${r},${c},${terrainLevel}`));
    setPreviewTool('select');
    setStatus(`Selected an ${platformSize}×${platformSize} group (${cells.length} floor tiles) at level ${terrainLevel}.`);
  };

  const paintPreviewArea = () => {
    const isPaintable = (r: number, c: number, level: number) => {
      const change = terrainChanges.find((candidate) =>
        candidate.r === r && candidate.c === c && candidate.level === level
      );
      return level === 0
        ? change?.kind !== 'erase' && change?.kind !== 'wall'
        : change?.kind === 'floor';
    };
    const selectedCells = selectedTerrainKeys.map((key) => key.split(',').map(Number))
      .filter(([r, c, level]) => isPaintable(r, c, level))
      .map(([r, c, level]) => ({ r, c, level }));
    const cells = selectedTerrainKeys.length
      ? selectedCells
      : getPreviewAreaCells()
        .filter((cell) => isPaintable(cell.r, cell.c, terrainLevel))
        .map((cell) => ({ ...cell, level: terrainLevel }));
    setTerrainChanges((current) => {
      const changes = new Map(current.map((change) => [
        `${change.r},${change.c},${change.level}`,
        change
      ]));
      for (const { r, c, level } of cells) {
        const key = `${r},${c},${level}`;
        const existing = changes.get(key);
        changes.set(key, {
          ...(existing || { r, c, level, kind: 'floor' as const }),
          color: terrainColor
        });
      }
      return [...changes.values()];
    });
    setPreviewTool('paint');
    setStatus(`Painted ${cells.length} floor tiles in the ${
      selectedTerrainKeys.length ? 'selected group' : `${platformSize}×${platformSize} area`
    }.`);
  };

  const resizeSelectedTerrain = (step: number) => {
    const selectedCells = selectedTerrainKeys.map((key) => key.split(',').map(Number));
    if (!selectedCells.length) {
      setStatus('Select a tile group before scaling.');
      return;
    }
    const levels = new Set(selectedCells.map(([, , level]) => level));
    if (levels.size !== 1) {
      setStatus('Scale one height level at a time.');
      return;
    }
    const level = [...levels][0];
    const format = normalizeFreezoneArenaFormat(config.arenaFormat);
    const resizedKeys = getFreezoneTerrainScaleKeys(selectedTerrainKeys, freezoneSide, format, step);
    if (!resizedKeys.length) {
      setStatus('The selected group cannot be scaled further within the arena.');
      return;
    }
    const resizedCells = resizedKeys.map((key) => {
      const [r, c] = key.split(',').map(Number);
      return { r, c };
    });
    const nextKeys = new Set(resizedKeys);
    setTerrainChanges((current) => {
      const changes = new Map(current.map((change) => [
        `${change.r},${change.c},${change.level}`,
        change
      ]));
      for (const [r, c, selectedLevel] of selectedCells) {
        const key = `${r},${c},${selectedLevel}`;
        if (nextKeys.has(key)) continue;
        if (selectedLevel === 0) {
          const existing = changes.get(key);
          changes.set(key, {
            ...(existing || { r, c, level: 0, kind: 'floor' as const }),
            r,
            c,
            level: 0,
            kind: 'erase'
          });
        } else {
          changes.delete(key);
        }
      }
      for (const cell of resizedCells) {
        const key = `${cell.r},${cell.c},${level}`;
        if (changes.has(key) && changes.get(key)?.kind === 'floor') continue;
        if (level === 0) {
          const existing = changes.get(key);
          if (existing?.kind === 'erase' || existing?.kind === 'wall') {
            changes.set(key, {
              r: cell.r,
              c: cell.c,
              level,
              kind: 'floor',
              color: terrainColor
            });
          } else {
            changes.set(key, {
              ...(existing || { r: cell.r, c: cell.c, level, kind: 'floor' as const }),
              color: terrainColor
            });
          }
        } else {
          changes.set(key, {
            r: cell.r,
            c: cell.c,
            level,
            kind: 'floor',
            color: terrainColor
          });
        }
      }
      return [...changes.values()];
    });
    setSelectedTerrainKeys(resizedKeys);
    const rows = resizedCells.map((cell) => cell.r);
    const cols = resizedCells.map((cell) => cell.c);
    const nextSize = Math.max(Math.max(...rows) - Math.min(...rows) + 1, Math.max(...cols) - Math.min(...cols) + 1);
    setPlatformSize(nextSize);
    setStatus(`Scaled the selected group to ${nextSize}×${nextSize}.`);
  };

  const selectTerrainCell = (r: number, c: number, level: number, additive: boolean) => {
    const key = `${r},${c},${level}`;
    setSelectedTerrainKeys((current) => {
      if (!additive) return [key];
      return current.includes(key)
        ? current.filter((selected) => selected !== key)
        : [...current, key];
    });
  };

  const moveSelectedTerrain = (dr: number, dc: number, dLevel: number) => {
    if (!selectedTerrainKeys.length) {
      setStatus('Select one or more floor tiles first.');
      return;
    }
    const selected = new Set(selectedTerrainKeys);
    const moves = selectedTerrainKeys.map((key) => {
      const [r, c, level] = key.split(',').map(Number);
      return { r, c, level, nextR: r + dr, nextC: c + dc, nextLevel: level + dLevel, key };
    });
    const format = normalizeFreezoneArenaFormat(config.arenaFormat);
    if (moves.some((move) => move.nextLevel < -3 || move.nextLevel > 3 ||
        !isValidFreezoneCell(move.nextR, move.nextC, freezoneSide, format))) {
      setStatus('The selected group cannot move outside the arena or height limits.');
      return;
    }
    const occupiedTargets = moves.some((move) => {
      const targetKey = `${move.nextR},${move.nextC},${move.nextLevel}`;
      if (targetKey === move.key || selected.has(targetKey)) return false;
      const target = terrainChanges.find((change) =>
        change.r === move.nextR && change.c === move.nextC && change.level === move.nextLevel
      );
      return move.nextLevel === 0
        ? target?.kind !== 'erase' && target?.kind !== 'wall'
        : target?.kind === 'floor';
    });
    if (occupiedTargets) {
      setStatus('That snapped position is occupied. Erase the destination tile before moving here.');
      return;
    }
    setTerrainChanges((current) => {
      const changes = new Map(current.map((change) => [
        `${change.r},${change.c},${change.level}`,
        change
      ]));
      for (const move of moves) {
        const existing = changes.get(move.key);
        changes.delete(move.key);
        if (move.level === 0) {
          changes.set(move.key, {
            ...(existing || { r: move.r, c: move.c, level: 0, kind: 'floor' as const }),
            r: move.r,
            c: move.c,
            level: 0,
            kind: 'erase'
          });
        }
      }
      for (const move of moves) {
        const existing = current.find((change) =>
          change.r === move.r && change.c === move.c && change.level === move.level
        );
        const nextKey = `${move.nextR},${move.nextC},${move.nextLevel}`;
        changes.set(nextKey, {
          ...(existing?.kind === 'floor' ? existing : {
            r: move.nextR,
            c: move.nextC,
            level: move.nextLevel,
            kind: 'floor' as const,
            color: terrainColor
          }),
          r: move.nextR,
          c: move.nextC,
          level: move.nextLevel,
          kind: 'floor'
        });
      }
      return [...changes.values()];
    });
    setSelectedTerrainKeys(moves.map((move) => `${move.nextR},${move.nextC},${move.nextLevel}`));
    setStatus(`Moved ${moves.length} snapped tile${moves.length === 1 ? '' : 's'}.`);
  };

  const rotateSelectedTerrain = (axis: 'x' | 'z') => {
    if (!selectedTerrainKeys.length) {
      setStatus('Select one or more floor tiles first.');
      return;
    }
    const selected = new Set(selectedTerrainKeys);
    setTerrainChanges((current) => {
      const changes = new Map(current.map((change) => [
        `${change.r},${change.c},${change.level}`,
        change
      ]));
      for (const key of selected) {
        const [r, c, level] = key.split(',').map(Number);
        const existing = changes.get(key);
        const base = existing || { r, c, level, kind: 'floor' as const };
        if (axis === 'x') {
          changes.set(key, { ...base, rotationX: ((base.rotationX || 0) + 90) % 360 });
        } else {
          changes.set(key, { ...base, rotationZ: ((base.rotationZ || 0) + 90) % 360 });
        }
      }
      return [...changes.values()];
    });
    setStatus(`Rotated ${selected.size} tile${selected.size === 1 ? '' : 's'} 90° around ${axis.toUpperCase()}.`);
  };

  const deleteSelectedTerrain = () => {
    if (!selectedTerrainKeys.length) return;
    const selected = new Set(selectedTerrainKeys);
    setTerrainChanges((current) => {
      const changes = new Map(current.map((change) => [
        `${change.r},${change.c},${change.level}`,
        change
      ]));
      for (const key of selected) {
        const [r, c, level] = key.split(',').map(Number);
        const existing = changes.get(key);
        if (level === 0) {
          changes.set(key, {
            ...(existing || { r, c, level, kind: 'floor' as const }),
            r,
            c,
            level,
            kind: 'erase'
          });
        } else {
          changes.delete(key);
        }
      }
      return [...changes.values()];
    });
    setSelectedTerrainKeys([]);
    setStatus('Removed the selected draft tiles.');
  };

  const startPreviewPlaytest = () => {
    const format = normalizeFreezoneArenaFormat(config.arenaFormat);
    const testLevel = terrainLevel;
    const levelChanges = terrainChanges.filter((change) => change.level === testLevel);
    const blockedCells = new Set(levelChanges
      .filter((change) => change.kind === 'erase' || change.kind === 'wall')
      .map((change) => `${change.r},${change.c}`));
    const originPiece = selectedPiece || config.pieces[0] || null;
    const openCells = (testLevel === 0
      ? getFreezoneArenaCells(freezoneSide, format)
      : levelChanges
        .filter((change) => change.kind === 'floor')
        .map(({ r, c }) => ({ r, c })))
      .filter((cell) => !blockedCells.has(`${cell.r},${cell.c}`));
    if (!openCells.length) {
      setStatus(testLevel === 0
        ? 'Add at least one base-level floor tile before starting the local test.'
        : `Add a floor tile at level ${testLevel} before starting the local test.`);
      return;
    }
    const startCell = originPiece && testLevel === 0 && openCells.some((cell) =>
      cell.r === originPiece.r && cell.c === originPiece.c
    )
      ? originPiece
      : openCells.reduce((closest, cell) => {
        const distance = Math.abs(cell.r - (freezoneSide - 1) / 2) +
          Math.abs(cell.c - (freezoneSide - 1) / 2);
        const closestDistance = Math.abs(closest.r - (freezoneSide - 1) / 2) +
          Math.abs(closest.c - (freezoneSide - 1) / 2);
        return distance < closestDistance ? cell : closest;
      }, openCells[0]);
    const template: CustomPiece = originPiece || {
      id: 'preview-test-piece',
      side: activeSide,
      type: pieceType,
      r: startCell.r,
      c: startCell.c,
      moves: defaultMoves(pieceType, SIDES[activeSide].forward),
      jumps: [] as MoveOffset[],
      slide: ['rook', 'bishop', 'queen'].includes(pieceType)
    };
    setPlaytestPiece({
      ...template,
      id: 'preview-test-piece',
      r: startCell.r,
      c: startCell.c,
      level: testLevel
    });
    setPlaytestMode(true);
    setPreviewTool('pieces');
    setBoardTool('pieces');
    setStatus(`Local playtest started at level ${testLevel}. Legal moves can land on any existing height; falling and physics are not simulated.`);
  };

  const stopPreviewPlaytest = () => {
    setPlaytestMode(false);
    setPlaytestPiece(null);
    setStatus('Returned to the editable arena draft.');
  };

  const handlePlaytestCellClick = (r: number, c: number, level: number) => {
    if (!playtestMoves.some((move) => move.r === r && move.c === c)) {
      setStatus('That is not a legal destination for the test piece.');
      return;
    }
    setPlaytestPiece((current) => current ? { ...current, r, c, level } : current);
    setStatus(`Test piece moved to ${r + 1}, ${c + 1}, level ${level}.`);
  };

  const handleAbilityClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedPiece) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const count = ABILITY_RADIUS * 2 + 1;
    const c = Math.floor(((event.clientX - bounds.left) / bounds.width) * count);
    const r = Math.floor(((event.clientY - bounds.top) / bounds.height) * count);
    const offset: MoveOffset = [ABILITY_RADIUS - r, c - ABILITY_RADIUS];
    if (offset[0] === 0 && offset[1] === 0) return;
    const limit = config.movementLimits?.[selectedPiece.type] ||
      { rows: FREEZONE_MAX_MOVEMENT_RANGE, cols: FREEZONE_MAX_MOVEMENT_RANGE };
    if (Math.abs(offset[0]) > limit.rows || Math.abs(offset[1]) > limit.cols) {
      setStatus(`That offset exceeds ${selectedPiece.type}'s ${limit.rows}×${limit.cols} movement limit.`);
      return;
    }
    setConfig((current) => ({
      ...current,
      pieces: current.pieces.map((piece) => {
        if (piece.id !== selectedPiece.id) return piece;
        const exists = piece.moves.some(([dr, dc]) => dr === offset[0] && dc === offset[1]);
        const isJump = piece.jumps?.some(([dr, dc]) => dr === offset[0] && dc === offset[1]);
        return {
          ...piece,
          moves: exists ? (isJump
            ? piece.moves.filter(([dr, dc]) => dr !== offset[0] || dc !== offset[1])
            : piece.moves) : [...piece.moves, offset],
          jumps: exists && !isJump
            ? [...(piece.jumps || []), offset]
            : (piece.jumps || []).filter(([dr, dc]) => dr !== offset[0] || dc !== offset[1])
        };
      })
    }));
  };

  const updateSelectedPiece = (updates: Partial<CustomPiece>) => {
    if (!selectedPiece) return;
    setConfig((current) => ({
      ...current,
      pieces: current.pieces.map((piece) =>
        piece.id === selectedPiece.id ? { ...piece, ...updates } : piece
      )
    }));
  };

  const handleSave = async () => {
    if (!modeName.trim()) {
      setStatus('Enter a name for this mode.');
      return;
    }
    if (config.gameMode === 'freezone') {
      if (!config.allowedPieceTypes.includes('king') || !config.allowedPieceTypes.length) {
        setStatus('Freezone needs allowed piece types including a king.');
        return;
      }
      if (!config.randomSpawn && visibleSides.some((_, side) =>
        !config.spawnPoints?.some((point) => point.side === side)
      )) {
        setStatus('Set a spawn point for every player or enable random spawning.');
        return;
      }
      if (visibleSides.some((_, side) =>
        config.pieces.filter((piece) => piece.side === side).length > config.piecesPerPlayer
      )) {
        setStatus(`Each player's placed piece templates are limited to ${config.piecesPerPlayer}.`);
        return;
      }
      if (visibleSides.some((_, side) =>
        config.pieces.some((piece) => piece.side === side) &&
        !config.pieces.some((piece) => piece.side === side && piece.type === 'king')
      )) {
        setStatus('Each player with custom starting templates must include a king.');
        return;
      }
    } else if (config.allowPieceSelection) {
      if (!config.allowedPieceTypes.includes('king') || !config.allowedPieceTypes.length) {
        setStatus('Choose at least one allowed piece type, including a king.');
        return;
      }
    } else if (visibleSides.some((_, side) =>
      config.pieces.filter((piece) => piece.side === side).length !== config.piecesPerPlayer ||
      !config.pieces.some((piece) => piece.side === side && piece.type === 'king')
    )) {
      setStatus(`Place exactly ${config.piecesPerPlayer} pieces, including a king, for every player.`);
      return;
    }
    setSaving(true);
    setStatus('Saving shared mode...');
    try {
      const saved = await saveGameMode(modeName, config);
      if (!saved) {
        setStatus('The server did not return the saved mode.');
        return;
      }
      setSavedModes((current) => [saved, ...current]);
      setStatus(`Saved "${saved.name}" for all players.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save this mode.');
    } finally {
      setSaving(false);
    }
  };

  const loadMode = (mode: SavedMode) => {
    setConfig(normalizeCreatorConfig(mode.config));
    setModeName(mode.name);
    setSelectedPieceId('');
    setActiveSide(0);
    setStatus(`Loaded "${mode.name}".`);
  };

  const removeSelectedPiece = () => {
    if (!selectedPiece) return;
    setConfig((current) => ({
      ...current,
      pieces: current.pieces.filter((piece) => piece.id !== selectedPiece.id)
    }));
    setSelectedPieceId('');
  };

  const startMode = (
    multiplayer: boolean,
    modeConfig: CustomGameMode = config,
    name = modeName
  ) => {
    saveEditorDraft();
    const orbSettings = normalizeFreezoneOrbSettings(modeConfig.orbSettings);
    const movementLimits = normalizeFreezoneMovementLimits(modeConfig.movementLimits);
    const pieceCooldownMs = normalizeFreezonePieceCooldowns(modeConfig.pieceCooldownMs);
    const floorTileGeometry = normalizeFreezoneTileGeometry(
      modeConfig.floorTileGeometry,
      normalizeFreezoneArenaFormat(modeConfig.arenaFormat)
    );
    if (modeConfig.gameMode === 'freezone') {
      const outOfRangePiece = modeConfig.pieces.find((piece) => {
        const limit = movementLimits[piece.type];
        return piece.moves.some(([r, c]) => Math.abs(r) > limit.rows || Math.abs(c) > limit.cols);
      });
      if (outOfRangePiece) {
        setStatus(`A ${outOfRangePiece.type} template has a move outside its configured ${movementLimits[outOfRangePiece.type].rows}×${movementLimits[outOfRangePiece.type].cols} limit.`);
        return;
      }
    }
    let sceneLayout = modeConfig.sceneLayout ?? null;
    if (modeConfig.gameMode === 'freezone') {
      const layoutInput = modeConfig === config
        ? {
          version: 1,
          boundsSize,
          terrainChanges,
          draftOrbs
        }
        : modeConfig.sceneLayout;
      const layoutValidation = validateFreezoneSceneLayout(
        layoutInput,
        freezoneSide,
        normalizeFreezoneArenaFormat(modeConfig.arenaFormat),
        { enabledOrbTypes: orbSettings.enabledTypes }
      );
      if (!layoutValidation.ok) {
        setStatus(`Cannot publish this arena layout yet: ${layoutValidation.error}`);
        return;
      }
      sceneLayout = layoutValidation.layout;
    }
    const modeSides = SIDES.slice(0, modeConfig.playerCount);
    if (multiplayer && modeConfig.gameMode === 'freezone') {
      const thumbnailValidation = validateFreezoneThumbnailUrl(
        modeConfig.publication?.thumbnailUrl || ''
      );
      if (!thumbnailValidation.ok) {
        setStatus(thumbnailValidation.error);
        return;
      }
    }
    if (modeConfig.gameMode === 'freezone' && !modeConfig.randomSpawn &&
        modeSides.some((_, side) => !modeConfig.spawnPoints?.some((point) => point.side === side))) {
      setStatus('Set a spawn point for every player or enable random spawning.');
      return;
    }
    if (modeSides.some((_, side) =>
      modeConfig.pieces.filter((piece) => piece.side === side).length > modeConfig.piecesPerPlayer
    )) {
      setStatus(`Each player's placed piece templates are limited to ${modeConfig.piecesPerPlayer}.`);
      return;
    }
    if (modeConfig.gameMode === 'freezone' && modeSides.some((_, side) =>
      modeConfig.pieces.some((piece) => piece.side === side) &&
      !modeConfig.pieces.some((piece) => piece.side === side && piece.type === 'king')
    )) {
      setStatus('Each player with custom starting templates must include a king.');
      return;
    }
    onStart({
      ...modeConfig,
      boardSize: modeConfig.gameMode === 'freezone' ? 32 : modeConfig.boardSize,
      randomSpawn: modeConfig.randomSpawn ?? true,
      arenaFormat: modeConfig.gameMode === 'freezone'
        ? (normalizeFreezoneArenaFormat(modeConfig.arenaFormat) as FreezoneArenaFormat)
        : 'square',
      floorTileGeometry: modeConfig.gameMode === 'freezone' ? floorTileGeometry : 'square',
      orbSettings,
      movementLimits,
      pieceCooldownMs,
      arenaName: name.trim() || (modeConfig.gameMode === 'freezone' ? 'Creator Freezone' : 'Custom Chess Room'),
      publication: modeConfig.gameMode === 'freezone'
        ? normalizeFreezoneRoomPublication({
          ...modeConfig.publication,
          name: name.trim() || modeConfig.publication?.name
        })
        : modeConfig.publication,
      sceneLayout: modeConfig.gameMode === 'freezone' ? sceneLayout : null
    }, multiplayer);
  };
  const closeCreator = () => {
    saveEditorDraft();
    onClose();
  };

  const sceneEditorContent = config.gameMode === 'freezone' ? (
    <div className={`mode-creator-scene-editor${immersivePreview ? ' immersive' : ''}`}>
      <div className="mode-creator-scene-header">
        <strong>{playtestMode ? 'Local piece playtest' : '3D scene draft'}</strong>
        <button type="button" onClick={() => setImmersivePreview((current) => !current)}>
          {immersivePreview ? 'Exit immersive view' : 'Expand immersive view'}
        </button>
      </div>
      {playtestMode ? (
        <div className="mode-creator-terrain-tools">
          <button type="button" onClick={stopPreviewPlaytest}>Stop playtest</button>
          <span>Green rings use the piece's normal move range and may land at another height; gravity is not simulated.</span>
        </div>
      ) : (
        <div className="mode-creator-terrain-tools" aria-label="3D preview tools">
          {([
            ['pieces', 'Place pieces'],
            ['orb', 'Place orb'],
            ['select', 'Select / gizmo'],
            ['floor', 'Add floor'],
            ['wall', 'Add wall'],
            ['erase', 'Erase tile'],
            ['paint', 'Paint tiles']
          ] as const).map(([tool, label]) => (
            <button
              type="button"
              key={tool}
              className={previewTool === tool ? 'selected' : ''}
              aria-pressed={previewTool === tool}
              onClick={() => {
                setPreviewTool(tool);
                if (tool === 'pieces') setBoardTool('pieces');
              }}
            >
              {label}
            </button>
          ))}
          {previewTool === 'orb' && (
            <label>
              Orb type
              <select
                value={activeOrbTypes.includes(selectedOrbType) ? selectedOrbType : ''}
                disabled={!activeOrbTypes.length}
                onChange={(event) => setSelectedOrbType(event.target.value)}
              >
                {activeOrbTypes.map((type) => (
                  <option key={type} value={type}>{ORB_LABELS[type]}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Height
            <button
              type="button"
              aria-label="Lower terrain level"
              disabled={terrainLevel <= -3}
              onClick={() => setTerrainLevel((level) => Math.max(-3, level - 1))}
            >
              -
            </button>
            <input
              type="range"
              min={-3}
              max={3}
              step={1}
              value={terrainLevel}
              onChange={(event) => setTerrainLevel(Number(event.target.value))}
            />
            <button
              type="button"
              aria-label="Raise terrain level"
              disabled={terrainLevel >= 3}
              onClick={() => setTerrainLevel((level) => Math.min(3, level + 1))}
            >
              +
            </button>
            <span>{terrainLevel}</span>
          </label>
          <label>
            Palette
            <input
              type="color"
              aria-label="Terrain paint color"
              value={terrainColor}
              onChange={(event) => setTerrainColor(event.target.value)}
            />
          </label>
          <label>
            Block size N×N
            <input
              type="number"
              min={1}
              max={freezoneSide}
              step={1}
              value={platformSize}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) setPlatformSize(Math.max(1, Math.min(freezoneSide, Math.floor(value))));
              }}
            />
          </label>
          <button type="button" onClick={fillPreviewPlatform}>Add {platformSize}×{platformSize} platform</button>
          <button type="button" onClick={erasePreviewArea}>Erase {platformSize}×{platformSize} area</button>
          <button type="button" onClick={paintPreviewArea}>
            {selectedTerrainKeys.length ? 'Paint selected group' : `Paint ${platformSize}×${platformSize} area`}
          </button>
          <button type="button" onClick={selectPreviewArea}>Select {platformSize}×{platformSize} group</button>
          {previewTool === 'select' && (
            <div className="mode-creator-terrain-gizmo" aria-label="Snapped tile gizmo">
              <button
                type="button"
                className={gizmoMode === 'move' ? 'selected' : ''}
                aria-pressed={gizmoMode === 'move'}
                onClick={() => setGizmoMode('move')}
              >
                Move
              </button>
              <button
                type="button"
                className={gizmoMode === 'scale' ? 'selected' : ''}
                aria-pressed={gizmoMode === 'scale'}
                onClick={() => setGizmoMode('scale')}
              >
                Scale
              </button>
              {gizmoMode === 'move' ? (
                <>
              <button type="button" aria-label="Move tiles along X minus" onClick={() => moveSelectedTerrain(0, -1, 0)}>X−</button>
              <button type="button" aria-label="Move tiles along X plus" onClick={() => moveSelectedTerrain(0, 1, 0)}>X+</button>
              <button type="button" aria-label="Move tiles along Z minus" onClick={() => moveSelectedTerrain(-1, 0, 0)}>Z−</button>
              <button type="button" aria-label="Move tiles along Z plus" onClick={() => moveSelectedTerrain(1, 0, 0)}>Z+</button>
              <button type="button" aria-label="Move tiles up" onClick={() => moveSelectedTerrain(0, 0, 1)}>Y+</button>
              <button type="button" aria-label="Move tiles down" onClick={() => moveSelectedTerrain(0, 0, -1)}>Y−</button>
              <button type="button" onClick={() => rotateSelectedTerrain('x')}>Rotate X 90°</button>
              <button type="button" onClick={() => rotateSelectedTerrain('z')}>Rotate Z 90°</button>
                </>
              ) : (
                <>
                  <button type="button" aria-label="Shrink selected group" onClick={() => resizeSelectedTerrain(-1)}>− Scale</button>
                  <button type="button" aria-label="Enlarge selected group" onClick={() => resizeSelectedTerrain(1)}>+ Scale</button>
                  <span>Drag the yellow handle in the preview to resize by whole tiles.</span>
                </>
              )}
              <button type="button" onClick={deleteSelectedTerrain}>Delete selected</button>
              {gizmoMode === 'move' && <span>Drag red X, green Y, or blue Z arrows to move one cell at a time; Shift-click adds/removes tiles.</span>}
            </div>
          )}
          <fieldset className="mode-creator-scene-bounds">
            <legend>Draft volume (tiles)</legend>
            {([
              ['width', 'X width', 4, 128],
              ['depth', 'Z depth', 4, 128],
              ['height', 'Y height', 2, 48]
            ] as const).map(([axis, label, min, max]) => (
              <label key={axis}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={boundsSize[axis]}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      setBoundsSize((current) => ({
                        ...current,
                        [axis]: Math.max(min, Math.min(max, Math.floor(value)))
                      }));
                    }
                  }}
                />
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            onClick={() => {
              setTerrainChanges([]);
              setDraftOrbs([]);
              setSelectedTerrainKeys([]);
              setBoundsSize({ width: 32, depth: 32, height: 6 });
              setPlatformSize(9);
              setTerrainLevel(0);
              setTerrainColor('#d4af37');
              setGizmoMode('move');
              setStatus('Reset the local scene draft.');
            }}
          >
            Reset draft
          </button>
          <button type="button" onClick={() => saveEditorDraft(true)}>Save 3D draft locally</button>
          <button type="button" onClick={startPreviewPlaytest}>Test a piece</button>
        </div>
      )}
      <p id="freezone-preview-controls-hint" className="mode-creator-hint">
        Drag to orbit, right-drag to pan, scroll to zoom; focus the scene and use WASD/arrows plus Q/E to move the camera.
        Drag the colored gizmo arrows to move selected tiles and the yellow handle to scale them. The cyan box marks the adjustable draft volume; only placed floor tiles are playable in this local test.
        Terrain is a private draft and is not published to a live match.
      </p>
      <FreezoneArenaPreview
        format={normalizeFreezoneArenaFormat(config.arenaFormat)}
        tileGeometry={normalizeFreezoneTileGeometry(config.floorTileGeometry, config.arenaFormat)}
        boardSize={freezoneSide}
        surfaceColor={normalizeFreezoneRoomTheme(config.publication?.theme || {}).surface}
        edgeColor={normalizeFreezoneRoomTheme(config.publication?.theme || {}).edge}
        pieces={playtestMode && playtestPiece ? [playtestPiece] : config.pieces}
        draftOrbs={draftOrbs}
        spawnPoints={config.spawnPoints || []}
        selectedPieceId={playtestMode ? 'preview-test-piece' : selectedPieceId}
        terrainChanges={terrainChanges}
        selectedTerrainKeys={selectedTerrainKeys}
        terrainTool={previewTool}
        terrainLevel={terrainLevel}
        gizmoMode={gizmoMode}
        boundsSize={boundsSize}
        brushColor={terrainColor}
        immersive={immersivePreview}
        playtestMode={playtestMode}
        legalMoves={playtestMoves}
        onCellClick={handleBoardCellClick}
        onTerrainSelectCellClick={selectTerrainCell}
        onMoveSelectedTerrain={(axis, steps) => moveSelectedTerrain(
          axis === 'z' ? steps : 0,
          axis === 'x' ? steps : 0,
          axis === 'y' ? steps : 0
        )}
        onScaleSelectedTerrain={resizeSelectedTerrain}
        onPlaytestCellClick={handlePlaytestCellClick}
        onTerrainCellClick={handleTerrainCellClick}
      />
      <p className="mode-creator-scene-status" aria-live="polite">{status}</p>
      <p className="mode-creator-scene-status" aria-live="polite">{draftStorageStatus}</p>
    </div>
  ) : null;
  const sceneEditor = immersivePreview && sceneEditorContent
    ? createPortal(sceneEditorContent, document.body)
    : sceneEditorContent;

  return (
    <div className="mode-creator-overlay open" onClick={closeCreator}>
      <section
        className="mode-creator-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-creator-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="multiplayer-close" onClick={closeCreator} aria-label="Close mode creator">×</button>
        <p className="multiplayer-eyebrow">CUSTOM GAME DESIGNER</p>
        <h2 id="mode-creator-title">Mode Creator</h2>
        <p className="multiplayer-description">
          Design a saved game, draw custom piece abilities and choose between turn-based play and Freezone.
        </p>

        <div className="mode-creator-settings">
          <label className="mode-creator-mode">
            <input
              type="checkbox"
              checked={config.gameMode === 'freezone'}
              onChange={(event) => {
                const gameMode = event.target.checked ? 'freezone' : 'turn-based';
                setConfig((current) => {
                  const playerCount = gameMode === 'freezone'
                    ? Math.max(10, current.playerCount)
                    : Math.min(4, current.playerCount);
                  const boardSize = gameMode === 'freezone' ? 32 : current.boardSize;
                  return {
                    ...current,
                    gameMode,
                    playerCount,
                    boardSize,
                    randomSpawn: current.randomSpawn ?? true
                  };
                });
                setSelectedPieceId('');
              }}
            />
            Freezone — open world, real-time movement, up to 10 players
          </label>
          {config.gameMode === 'freezone' && (
            <label className="mode-creator-mode">
              <input
                type="checkbox"
                checked={config.randomSpawn !== false}
                onChange={(event) => {
                  const randomSpawn = event.target.checked;
                  setConfig((current) => ({ ...current, randomSpawn }));
                  setBoardTool(randomSpawn ? 'pieces' : 'spawn');
                  setStatus(randomSpawn ? 'Players will spawn at random arena positions.' : 'Choose a spawn point for each player on the preview.');
                }}
              />
              Random player spawn positions
            </label>
          )}
          <label>
            {config.gameMode === 'freezone' ? 'Arena side (tiles)' : 'Board side (tiles)'}
            <input
              type="number"
              min="4"
              step="1"
              value={config.boardSize}
              disabled={config.gameMode === 'freezone'}
              onChange={(event) => {
                const boardSize = Math.max(4, Math.floor(Number(event.target.value) || 4));
                setConfig((current) => ({
                  ...current,
                  boardSize,
                  pieces: current.pieces.filter((piece) => piece.r < boardSize && piece.c < boardSize)
                }));
                setSelectedPieceId('');
              }}
            />
          </label>
          <label>
            Players
            <select
              value={config.playerCount}
              onChange={(event) => {
                const playerCount = Number(event.target.value);
                setConfig((current) => ({
                  ...current,
                  playerCount,
                  boardSize: current.gameMode === 'freezone' ? 32 : current.boardSize,
                  pieces: current.pieces.filter((piece) => piece.side < playerCount),
                  spawnPoints: (current.spawnPoints || []).filter((point) => point.side < playerCount)
                }));
                setSelectedPieceId('');
              }}
            >
              {Array.from(
                { length: config.gameMode === 'freezone' ? 9 : 3 },
                (_, index) => index + 2
              ).map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>
          <label>
            {config.gameMode === 'freezone' ? 'Maximum placed templates per player' : 'Pieces per player'}
            <input
              type="number"
              min="1"
              max="20"
              value={config.piecesPerPlayer}
              onChange={(event) => {
                const piecesPerPlayer = Math.max(1, Math.min(20, Math.floor(Number(event.target.value) || 1)));
                setConfig((current) => ({
                  ...current,
                  piecesPerPlayer,
                  boardSize: current.gameMode === 'freezone' ? 32 : current.boardSize
                }));
              }}
            />
          </label>
          {config.gameMode === 'turn-based' && (
            <label>
              Pieces moved per turn
              <input
                type="number"
                min="1"
                value={config.movesPerTurn}
                onChange={(event) => setConfig((current) => ({
                  ...current,
                  movesPerTurn: Math.max(1, Math.floor(Number(event.target.value) || 1))
                }))}
              />
            </label>
          )}
          {config.gameMode === 'turn-based' && (
            <label className="mode-creator-mode">
              <input
                type="checkbox"
                checked={config.allowPieceSelection}
                onChange={(event) => setConfig((current) => ({
                  ...current,
                  allowPieceSelection: event.target.checked
                }))}
              />
              Allow players to choose from the approved piece types
            </label>
          )}
          <fieldset className="mode-creator-allowed">
            <legend>Piece types allowed in this mode</legend>
            {PIECES.map((piece) => (
              <label key={piece.type}>
                <input
                  type="checkbox"
                  checked={config.allowedPieceTypes.includes(piece.type)}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    allowedPieceTypes: event.target.checked
                      ? [...current.allowedPieceTypes, piece.type]
                      : current.allowedPieceTypes.filter((type) => type !== piece.type)
                  }))}
                />
                {piece.name}
              </label>
            ))}
          </fieldset>
          {config.gameMode === 'freezone' && (
            <>
              <fieldset className="mode-creator-allowed">
                <legend>Freezone orbs</legend>
                <p className="mode-creator-hint">
                  Disabled types will not spawn. XP values are awarded in addition to each orb's normal effect.
                </p>
                {FREEZONE_ORB_TYPES.map((type) => {
                  const settings = normalizeFreezoneOrbSettings(config.orbSettings);
                  return (
                    <div className="mode-creator-orb-rule" key={type}>
                      <label>
                        <input
                          type="checkbox"
                          checked={settings.enabledTypes.includes(type)}
                          onChange={(event) => setConfig((current) => {
                            const currentSettings = normalizeFreezoneOrbSettings(current.orbSettings);
                            return {
                              ...current,
                              orbSettings: {
                                ...currentSettings,
                                enabledTypes: event.target.checked
                                  ? [...currentSettings.enabledTypes, type]
                                  : currentSettings.enabledTypes.filter((entry) => entry !== type)
                              }
                            };
                          })}
                        />
                        {ORB_LABELS[type]}
                      </label>
                      <label>
                        XP
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          step="1"
                          value={settings.xpByType[type]}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            if (!Number.isFinite(value)) return;
                            setConfig((current) => {
                              const currentSettings = normalizeFreezoneOrbSettings(current.orbSettings);
                              return {
                                ...current,
                                orbSettings: {
                                  ...currentSettings,
                                  xpByType: {
                                    ...currentSettings.xpByType,
                                    [type]: Math.max(0, Math.min(1000, Math.floor(value)))
                                  }
                                }
                              };
                            });
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </fieldset>
              <fieldset className="mode-creator-allowed">
                <legend>Movement limits by piece type</legend>
                <p className="mode-creator-hint">
                  Maximum row and column distance, from 1 to {FREEZONE_MAX_MOVEMENT_RANGE} tiles. Existing player envelopes may impose a smaller limit.
                </p>
                {PIECES.map((piece) => {
                  const limit = config.movementLimits?.[piece.type] ||
                    { rows: FREEZONE_MAX_MOVEMENT_RANGE, cols: FREEZONE_MAX_MOVEMENT_RANGE };
                  return (
                    <div className="mode-creator-orb-rule" key={piece.type}>
                      <strong>{piece.name}</strong>
                      {(['rows', 'cols'] as const).map((axis) => (
                        <label key={axis}>
                          {axis === 'rows' ? 'Rows' : 'Cols'}
                          <input
                            type="number"
                            min="1"
                            max={FREEZONE_MAX_MOVEMENT_RANGE}
                            value={limit[axis]}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              if (!Number.isFinite(value)) return;
                              setConfig((current) => {
                                const limits = normalizeFreezoneMovementLimits(current.movementLimits);
                                return {
                                  ...current,
                                  movementLimits: {
                                    ...limits,
                                    [piece.type]: {
                                      ...limits[piece.type],
                                      [axis]: Math.max(1, Math.min(FREEZONE_MAX_MOVEMENT_RANGE, Math.floor(value)))
                                    }
                                  }
                                };
                              });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  );
                })}
              </fieldset>
              <fieldset className="mode-creator-allowed">
                <legend>Action delay by piece type</legend>
                <p className="mode-creator-hint">Delay before that same piece can move again. Set to 0 for no extra delay.</p>
                {PIECES.map((piece) => (
                  <label key={piece.type}>
                    {piece.name} · seconds
                    <input
                      type="number"
                      min="0"
                      max={FREEZONE_MAX_PIECE_COOLDOWN_MS / 1000}
                      step="0.25"
                      value={(config.pieceCooldownMs?.[piece.type] || 0) / 1000}
                      onChange={(event) => {
                        const seconds = Number(event.target.value);
                        if (!Number.isFinite(seconds)) return;
                        setConfig((current) => ({
                          ...current,
                          pieceCooldownMs: {
                            ...normalizeFreezonePieceCooldowns(current.pieceCooldownMs),
                            [piece.type]: Math.max(
                              0,
                              Math.min(FREEZONE_MAX_PIECE_COOLDOWN_MS, Math.round(seconds * 1000))
                            )
                          }
                        }));
                      }}
                    />
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </div>

        <div className="mode-creator-layout">
          <div className="mode-creator-board-column">
            <div className="mode-creator-label">
              {config.gameMode === 'freezone'
                ? `Freezone player templates · ${freezoneSide} × ${freezoneSide}`
                : `Initial position · ${config.boardSize} × ${config.boardSize}`}
            </div>
            {config.gameMode === 'freezone' && (
              <p className="mode-creator-hint">
                Up to {config.piecesPerPlayer} placed templates per player. {config.randomSpawn
                  ? 'Players are dropped at random positions.'
                  : 'Choose each player, select Set spawn point, then click the arena preview.'}
              </p>
            )}
            {sceneEditor}
            <div className="mode-creator-board-wrap">
              <canvas
                ref={boardCanvasRef}
                width={PREVIEW_SIZE}
                height={PREVIEW_SIZE}
                className="mode-creator-board"
                onClick={handleBoardClick}
                aria-label="Click empty tiles to place pieces or existing pieces to edit them"
              />
            </div>
            {config.gameMode === 'freezone' && (
              <div className="mode-creator-tools">
                {!config.randomSpawn && (
                  <button
                    type="button"
                    className={boardTool === 'spawn' ? 'selected' : ''}
                    onClick={() => setBoardTool('spawn')}
                  >
                    Set spawn point for {SIDES[activeSide].name}
                  </button>
                )}
                <button
                  type="button"
                  className={boardTool === 'pieces' ? 'selected' : ''}
                  onClick={() => setBoardTool('pieces')}
                >
                  Place piece templates
                </button>
                {selectedPiece && (
                  <button
                    type="button"
                    className={boardTool === 'move' ? 'selected' : ''}
                    onClick={() => setBoardTool('move')}
                  >
                    Move selected piece
                  </button>
                )}
                {!config.randomSpawn && (
                  <span>
                    {activeSpawnPoint
                      ? `Spawn: ${activeSpawnPoint.r + 1}, ${activeSpawnPoint.c + 1}`
                      : 'Spawn point not set'}
                  </span>
                )}
              </div>
            )}
            <div className="mode-creator-sides">
              {visibleSides.map((side, index) => (
                <button
                  type="button"
                  key={side.name}
                  className={activeSide === index ? 'selected' : ''}
                  onClick={() =>                   setActiveSide(index)}
                >
                  <i style={{ background: side.color }} />
                  {side.name} · {config.pieces.filter((piece) => piece.side === index).length}/{config.piecesPerPlayer}
                </button>
              ))}
            </div>
            <div className="mode-creator-piece-types">
              {PIECES.map((piece) => (
                <button
                  type="button"
                  key={piece.type}
                  className={pieceType === piece.type ? 'selected' : ''}
                  disabled={!config.allowedPieceTypes.includes(piece.type)}
                  onClick={() => setPieceType(piece.type)}
                >
                  {piece.name}
                </button>
              ))}
            </div>
            {selectedPiece && (
              <div className="mode-creator-selected">
                Editing {SIDES[selectedPiece.side].name} {selectedPiece.type}
                <button type="button" onClick={removeSelectedPiece}>Remove piece</button>
              </div>
            )}
          </div>

          <div className="mode-creator-ability-column">
            <div className="mode-creator-label">Ordered movement path · click offsets up to 15 tiles away</div>
            <canvas
              ref={abilityCanvasRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              className={`mode-creator-ability ${selectedPiece ? '' : 'disabled'}`}
              onClick={handleAbilityClick}
              aria-label="Click cells around the center to add or remove a movement offset"
            />
            <div className="mode-creator-move-legend">
              <span><i className="ordinary" /> Ordinary move</span>
              <span><i className="jump" /> Jump step</span>
            </div>
            <label className="mode-creator-slide">
              <input
                type="checkbox"
                checked={Boolean(selectedPiece?.slide)}
                disabled={!selectedPiece}
                onChange={(event) => updateSelectedPiece({ slide: event.target.checked })}
              />
              Repeat selected directions until blocked
            </label>
            <p className="mode-creator-hint">
              Numbered squares show movement order. Click a blue square again to mark that step as a green jump;
              click it once more to remove it. Jumps bypass intervening pieces.
            </p>
          </div>
        </div>

        <div className="mode-creator-save">
          <input
            value={modeName}
            maxLength={60}
            placeholder={config.gameMode === 'freezone' ? 'Arena name' : 'Name this game mode'}
            onChange={(event) => setModeName(event.target.value)}
          />
          {config.gameMode === 'freezone' && (
            <div className="mode-creator-publication">
              <label>
                Arena format
                <select
                  value={config.arenaFormat || 'square'}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    arenaFormat: normalizeFreezoneArenaFormat(event.target.value) as FreezoneArenaFormat
                  }))}
                >
                  {FREEZONE_ARENA_FORMATS.map((format) => (
                    <option key={format.id} value={format.id}>{format.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Floor tile geometry
                <select
                  value={normalizeFreezoneTileGeometry(config.floorTileGeometry, config.arenaFormat)}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    floorTileGeometry: normalizeFreezoneTileGeometry(
                      event.target.value,
                      current.arenaFormat
                    )
                  }))}
                >
                  {FREEZONE_TILE_GEOMETRIES.map((geometry) => (
                    <option key={geometry} value={geometry}>
                      {geometry === 'hexagonal'
                        ? 'Hexagon'
                        : geometry === 'triangle'
                          ? 'Triangle'
                          : geometry === 'round' ? 'Circle' : 'Square'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Short arena description
                <textarea
                  maxLength={280}
                  rows={2}
                  value={config.publication?.description || ''}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    publication: {
                      ...normalizeFreezoneRoomPublication(current.publication, modeName),
                      description: event.target.value.slice(0, 280)
                    }
                  }))}
                  placeholder="What should players know before joining?"
                />
              </label>
              <div className="mode-creator-theme-row">
                <label>
                  Arena surface
                  <input
                    type="color"
                    value={normalizeFreezoneRoomTheme(config.publication?.theme || {}).surface}
                    onChange={(event) => setConfig((current) => {
                      const publication = normalizeFreezoneRoomPublication(current.publication, modeName);
                      return {
                        ...current,
                        publication: {
                          ...publication,
                          theme: {
                            ...publication.theme,
                            surface: event.target.value
                          }
                        }
                      };
                    })}
                  />
                </label>
                <label>
                  Arena edge
                  <input
                    type="color"
                    value={normalizeFreezoneRoomTheme(config.publication?.theme || {}).edge}
                    onChange={(event) => setConfig((current) => {
                      const publication = normalizeFreezoneRoomPublication(current.publication, modeName);
                      return {
                        ...current,
                        publication: {
                          ...publication,
                          theme: {
                            ...publication.theme,
                            edge: event.target.value
                          }
                        }
                      };
                    })}
                  />
                </label>
                <label>
                  Team accent
                  <input
                    type="color"
                    value={normalizeFreezoneRoomTheme(config.publication?.theme || {}).team}
                    onChange={(event) => setConfig((current) => {
                      const publication = normalizeFreezoneRoomPublication(current.publication, modeName);
                      return {
                        ...current,
                        publication: {
                          ...publication,
                          theme: {
                            ...publication.theme,
                            team: event.target.value
                          }
                        }
                      };
                    })}
                  />
                </label>
              </div>
              <label>
                Thumbnail URL (HTTP or HTTPS)
                <input
                  type="url"
                  maxLength={2048}
                  value={config.publication?.thumbnailUrl || ''}
                  onChange={(event) => setConfig((current) => ({
                    ...current,
                    publication: {
                      ...normalizeFreezoneRoomPublication(current.publication, modeName),
                      thumbnailUrl: event.target.value
                    }
                  }))}
                  placeholder="https://example.com/arena.jpg"
                />
              </label>
              <label>
                Wallpaper URL
                <input
                  type="url"
                  maxLength={2048}
                  value={config.publication?.theme?.wallpaperUrl || config.publication?.wallpaperUrl || ''}
                  onChange={(event) => setConfig((current) => {
                    const publication = normalizeFreezoneRoomPublication(current.publication, modeName);
                    return {
                      ...current,
                      publication: {
                        ...publication,
                        wallpaperUrl: event.target.value,
                        theme: {
                          ...publication.theme,
                          wallpaperUrl: event.target.value
                        }
                      }
                    };
                  })}
                  placeholder="https://example.com/arena-wallpaper.jpg"
                />
              </label>
              {config.publication?.thumbnailUrl &&
                validateFreezoneThumbnailUrl(config.publication.thumbnailUrl).ok && (
                <img
                  className="mode-creator-thumbnail-preview"
                  src={validateFreezoneThumbnailUrl(config.publication.thumbnailUrl).url}
                  alt="Arena thumbnail preview"
                  loading="lazy"
                />
              )}
              {config.publication?.thumbnailUrl &&
                !validateFreezoneThumbnailUrl(config.publication.thumbnailUrl).ok && (
                  <span className="mode-creator-validation" role="status">
                    {validateFreezoneThumbnailUrl(config.publication.thumbnailUrl).error}
                  </span>
                )}
              <fieldset>
                <legend>Arena tags (choose up to 5)</legend>
                {FREEZONE_ROOM_TAGS.map((tag) => (
                  <label key={tag}>
                    <input
                      type="checkbox"
                      checked={(config.publication?.tags || []).includes(tag)}
                      disabled={!(config.publication?.tags || []).includes(tag) &&
                        (config.publication?.tags.length || 0) >= 5}
                      onChange={(event) => setConfig((current) => {
                        const publication = normalizeFreezoneRoomPublication(
                          current.publication,
                          modeName
                        );
                        const tags = event.target.checked
                          ? [...publication.tags, tag]
                          : publication.tags.filter((entry) => entry !== tag);
                        return { ...current, publication: { ...publication, tags } };
                      })}
                    />
                    {tag}
                  </label>
                ))}
              </fieldset>
            </div>
          )}
          <button type="button" className="multiplayer-action" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save shared mode'}
          </button>
          <button type="button" className="multiplayer-action primary" onClick={() => startMode(false)}>
            Play locally
          </button>
          <button type="button" className="multiplayer-action primary" onClick={() => startMode(true)}>
            {config.gameMode === 'freezone' ? 'Publish Freezone arena' : 'Create multiplayer room'}
          </button>
        </div>
        <p className="multiplayer-status" aria-live="polite">{status}</p>

        <div className="mode-creator-saved">
          <div className="mode-creator-label">Shared saved modes</div>
          {savedModes.length === 0
            ? <p className="mode-creator-hint">No saved modes yet.</p>
            : savedModes.map((mode) => (
              <div className="mode-creator-saved-row" key={mode.id}>
                <button type="button" className="mode-creator-load" onClick={() => loadMode(mode)}>
                  <strong>{mode.name}</strong>
                  <span>{mode.config.boardSize} × {mode.config.boardSize} · {mode.config.playerCount} players · {mode.config.pieces.length} pieces</span>
                </button>
                <button type="button" onClick={() => startMode(false, mode.config, mode.name)}>Play</button>
                <button type="button" onClick={() => startMode(true, mode.config, mode.name)}>Room</button>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
