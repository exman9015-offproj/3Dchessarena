import { useEffect, useMemo, useRef, useState } from 'react';
import { listGameModes, saveGameMode } from './multiplayerSupabase.js';

type Side = number;
type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
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
  arenaName?: string;
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
const ABILITY_RADIUS = 15;
const PREVIEW_SIZE = 620;

function defaultMoves(type: PieceType, forward: MoveOffset): MoveOffset[] {
  if (type === 'pawn') return [[...forward]];
  if (type === 'knight') return [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  if (type === 'rook') return [[-1, 0], [1, 0], [0, -1], [0, 1]];
  if (type === 'bishop') return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  if (type === 'queen') return [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  return [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
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
    spawnPoints: []
  };
}

export default function ModeCreator({ open, onClose, onStart }: Props) {
  const [config, setConfig] = useState<CustomGameMode>(freshConfig);
  const [activeSide, setActiveSide] = useState<Side>(0);
  const [pieceType, setPieceType] = useState<PieceType>('pawn');
  const [selectedPieceId, setSelectedPieceId] = useState('');
  const [modeName, setModeName] = useState('');
  const [savedModes, setSavedModes] = useState<SavedMode[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [boardTool, setBoardTool] = useState<'pieces' | 'spawn'>('pieces');
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const abilityCanvasRef = useRef<HTMLCanvasElement>(null);
  const selectedPiece = useMemo(
    () => config.pieces.find((piece) => piece.id === selectedPieceId) || null,
    [config.pieces, selectedPieceId]
  );
  const visibleSides = SIDES.slice(0, config.playerCount);
  const freezoneSide = 32;
  const sidePieceCount = config.pieces.filter((piece) => piece.side === activeSide).length;
  const activeSpawnPoint = config.spawnPoints?.find((point) => point.side === activeSide);

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
        ctx.fillStyle = (r + c) % 2 ? '#20232b' : '#ded5c4';
        ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
      }
    }
    for (const piece of config.pieces) {
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
  }, [config, selectedPieceId]);

  useEffect(() => {
    const canvas = abilityCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const count = ABILITY_RADIUS * 2 + 1;
    const cell = PREVIEW_SIZE / count;
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        ctx.fillStyle = (r + c) % 2 ? '#242934' : '#151a23';
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
  }, [selectedPiece]);

  if (!open) return null;

  const handleBoardClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const c = Math.floor(((event.clientX - bounds.left) / bounds.width) * config.boardSize);
    const r = Math.floor(((event.clientY - bounds.top) / bounds.height) * config.boardSize);
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

  const handleAbilityClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectedPiece) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const count = ABILITY_RADIUS * 2 + 1;
    const c = Math.floor(((event.clientX - bounds.left) / bounds.width) * count);
    const r = Math.floor(((event.clientY - bounds.top) / bounds.height) * count);
    const offset: MoveOffset = [ABILITY_RADIUS - r, c - ABILITY_RADIUS];
    if (offset[0] === 0 && offset[1] === 0) return;
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
    setConfig(mode.config);
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
    const modeSides = SIDES.slice(0, modeConfig.playerCount);
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
      arenaName: name.trim() || (modeConfig.gameMode === 'freezone' ? 'Creator Freezone' : 'Custom Chess Room')
    }, multiplayer);
  };

  return (
    <div className="mode-creator-overlay open" onClick={onClose}>
      <section
        className="mode-creator-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-creator-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="multiplayer-close" onClick={onClose} aria-label="Close mode creator">×</button>
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
            {config.gameMode === 'freezone' && !config.randomSpawn && (
              <div className="mode-creator-tools">
                <button
                  type="button"
                  className={boardTool === 'spawn' ? 'selected' : ''}
                  onClick={() => setBoardTool('spawn')}
                >
                  Set spawn point for {SIDES[activeSide].name}
                </button>
                <button
                  type="button"
                  className={boardTool === 'pieces' ? 'selected' : ''}
                  onClick={() => setBoardTool('pieces')}
                >
                  Place piece templates
                </button>
                <span>
                  {activeSpawnPoint
                    ? `Spawn: ${activeSpawnPoint.r + 1}, ${activeSpawnPoint.c + 1}`
                    : 'Spawn point not set'}
                </span>
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
            placeholder="Name this game mode"
            onChange={(event) => setModeName(event.target.value)}
          />
          <button type="button" className="multiplayer-action" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save shared mode'}
          </button>
          <button type="button" className="multiplayer-action primary" onClick={() => startMode(false)}>
            Play locally
          </button>
          <button type="button" className="multiplayer-action primary" onClick={() => startMode(true)}>
            Create multiplayer room
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
