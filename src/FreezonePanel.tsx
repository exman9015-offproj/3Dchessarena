import { useEffect, useRef, useState, type FormEvent } from 'react';

type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen';
type MoveOffset = [number, number];

type FreezoneRoom = {
  id: string;
  code: string;
  status: string;
  kind: string;
  name: string;
  isMainArena: boolean;
  joined: number;
  capacity: number;
};

export type FreezonePattern = {
  id: string;
  name: string;
  title: string;
  catchphrase: string;
  type: PieceType;
  moves: MoveOffset[];
  jumps: MoveOffset[];
  slide: boolean;
};

type FreezoneOwnedPiece = {
  id: string;
  name: string;
  title: string;
  catchphrase: string;
  type: PieceType | 'king';
};

type FreezoneOrbEffect = {
  type: 'xp' | 'red' | 'yellow' | 'purple' | 'white';
  label: string;
  description: string;
  color: string;
};

type FreezoneHud = {
  enabled: boolean;
  isPlayer: boolean;
  xp: number;
  xpCost: number;
  xpProgress: number;
  capacity: number;
  maxCapacity: number;
  pieces: number;
  movesPerCycle: number;
  cooldownDurationMs: number;
  editorRange: number;
  maxPatternOffsets: number;
  upgradeLevels: { red: number; yellow: number; purple: number; white: number };
  ownedPieces: FreezoneOwnedPiece[];
  orbEffects: FreezoneOrbEffect[];
  movesUsed: number;
  cooldownMs: number;
  boardSize: number;
  roomCode?: string;
  pieceOptions: FreezonePattern[];
};

type FreezoneApiResult = { ok: boolean; code?: string; error?: string };
type FreezonePatternInput = Omit<FreezonePattern, 'id'> | FreezonePattern;

const PIECE_TYPES: { type: PieceType; label: string }[] = [
  { type: 'pawn', label: 'Pawn' },
  { type: 'rook', label: 'Rook' },
  { type: 'knight', label: 'Knight' },
  { type: 'bishop', label: 'Bishop' },
  { type: 'queen', label: 'Queen' }
];

function movementText(moves: MoveOffset[], jumps: MoveOffset[], slide: boolean) {
  const directions = moves
    .map(([row, col], index) => {
      const jump = jumps.some(([jumpRow, jumpCol]) => jumpRow === row && jumpCol === col);
      return `${index + 1}${jump ? ' jump' : ''}: ${row > 0 ? '+' : ''}${row},${col > 0 ? '+' : ''}${col}`;
    })
    .join(' · ');
  return `${slide ? 'Sliding' : 'Step'}: ${directions}`;
}

export default function FreezonePanel() {
  const [hud, setHud] = useState<FreezoneHud | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState('');
  const [rooms, setRooms] = useState<FreezoneRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [designMode, setDesignMode] = useState(false);
  const [pieceType, setPieceType] = useState<PieceType>('knight');
  const [pieceName, setPieceName] = useState('');
  const [pieceTitle, setPieceTitle] = useState('');
  const [pieceCatchphrase, setPieceCatchphrase] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<FreezonePatternInput | null>(null);
  const [selectedMoves, setSelectedMoves] = useState<MoveOffset[]>([]);
  const [selectedJumps, setSelectedJumps] = useState<MoveOffset[]>([]);
  const [slide, setSlide] = useState(false);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    const handleFreezoneState = (event: Event) => {
      const detail = (event as CustomEvent<FreezoneHud>).detail;
      setHud(detail?.enabled ? detail : null);
      if (detail?.roomCode) setRoomCode(detail.roomCode);
    };
    const handleNotice = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (!message) return;
      setNotice(message);
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(''), 3500);
    };
    window.addEventListener('wizard-chess-freezone-state', handleFreezoneState);
    window.addEventListener('wizard-chess-freezone-notice', handleNotice);
    return () => {
      window.removeEventListener('wizard-chess-freezone-state', handleFreezoneState);
      window.removeEventListener('wizard-chess-freezone-notice', handleNotice);
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open || hud) return;
    let active = true;
    let refreshing = false;
    let mainRoomEnsured = false;
    const refreshRooms = async (ensureMain = false) => {
      if (refreshing) return;
      refreshing = true;
      const api = window.wizardChess;
      if (!api?.listFreezoneRooms) {
        if (active) {
          setStatus('Freezone is still starting. Try again in a moment.');
          if (ensureMain) setRoomsLoading(false);
        }
        refreshing = false;
        return;
      }
      try {
        if (!mainRoomEnsured && api.ensureFreezoneMainRoom) {
          await api.ensureFreezoneMainRoom();
          mainRoomEnsured = true;
        }
        const nextRooms = await api.listFreezoneRooms();
        if (active) {
          setRooms(nextRooms);
          setStatus((current) =>
            current === 'Freezone is still starting. Try again in a moment.' ? '' : current
          );
        }
      } catch (error) {
        if (active) setStatus(error instanceof Error ? error.message : 'Could not load Freezone rooms.');
      } finally {
        if (active && ensureMain) setRoomsLoading(false);
        refreshing = false;
      }
    };
    const handleApiReady = () => void refreshRooms(true);
    window.addEventListener('wizard-chess-api-ready', handleApiReady);
    setRoomsLoading(true);
    void refreshRooms(true);
    const timer = window.setInterval(() => void refreshRooms(), 8000);
    return () => {
      active = false;
      window.removeEventListener('wizard-chess-api-ready', handleApiReady);
      window.clearInterval(timer);
    };
  }, [open, hud]);

  useEffect(() => {
    if (!hud?.enabled) return;
    const timer = window.setInterval(() => {
      setHud((current) => current
        ? {
          ...current,
          cooldownMs: Math.max(0, current.cooldownMs - 250),
          movesUsed: current.cooldownMs <= 250 ? 0 : current.movesUsed
        }
        : current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [hud?.enabled]);

  const createArena = async () => {
    const action = window.wizardChess?.createFreezoneRoom;
    if (!action) {
      setStatus('Freezone is still starting. Try again in a moment.');
      return;
    }
    setBusy(true);
    setStatus('Creating a Freezone arena...');
    try {
      const result = await action();
      if (!result.ok) {
        setStatus(result.error || 'Could not create a Freezone arena.');
        return;
      }
      if (result.code) setRoomCode(result.code);
      setStatus(result.code ? `Arena ${result.code} is ready.` : 'Freezone arena ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create a Freezone arena.');
    } finally {
      setBusy(false);
    }
  };

  const joinArena = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await joinArenaCode(joinCode);
  };

  const joinArenaCode = async (input: string) => {
    const action = window.wizardChess?.joinFreezoneRoom;
    if (!action) {
      setStatus('Freezone is still starting. Try again in a moment.');
      return;
    }
    const code = input.trim().toUpperCase();
    setBusy(true);
    setStatus(`Joining arena ${code}...`);
    try {
      const result = await action(code);
      if (!result.ok) {
        setStatus(result.error || 'Could not join this Freezone arena.');
        return;
      }
      if (result.code) setRoomCode(result.code);
      setStatus(`Joined Freezone arena ${result.code || code}.`);
      setRooms([]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not join this Freezone arena.');
    } finally {
      setBusy(false);
    }
  };

  const acquirePiece = async (pattern: FreezonePatternInput, replacementId = '') => {
    const action = window.wizardChess?.buyFreezonePiece;
    if (!action) {
      setStatus('Freezone is still starting. Try again in a moment.');
      return;
    }
    if (hud && hud.pieces >= hud.capacity && !replacementId) {
      setPendingReplacement(pattern);
      setStatus(`Army full. Choose a piece to replace; this costs ${hud.xpCost} XP.`);
      return;
    }
    setPurchaseBusy(true);
    try {
      const result = await action(pattern, replacementId);
      if (result.ok) {
        setPendingReplacement(null);
        setStatus(replacementId
          ? `${pattern.name} acquired; the selected piece was replaced.`
          : `${pattern.name} acquired. It has joined your army.`);
      } else {
        setStatus(result.error || 'Could not acquire this piece.');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not acquire this piece.');
    } finally {
      setPurchaseBusy(false);
    }
  };

  const toggleMove = (row: number, col: number) => {
    const exists = selectedMoves.some(([r, c]) => r === row && c === col);
    const isJump = selectedJumps.some(([r, c]) => r === row && c === col);
    if (!exists) {
      if (selectedMoves.length >= (hud?.maxPatternOffsets || 48)) {
        setStatus(`A pattern can have at most ${hud?.maxPatternOffsets || 48} offsets.`);
        return;
      }
      setSelectedMoves((current) => [...current, [row, col]]);
      return;
    }
    if (!isJump) {
      setSelectedJumps((current) => [...current, [row, col]]);
      return;
    }
    setSelectedMoves((current) => {
      const exists = current.some(([r, c]) => r === row && c === col);
      return exists ? current.filter(([r, c]) => r !== row || c !== col) : current;
    });
    setSelectedJumps((current) => current.filter(([r, c]) => r !== row || c !== col));
  };

  const copyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setStatus('Arena code copied.');
    } catch {
      setStatus('Could not access the clipboard. Select and copy the arena code.');
    }
  };

  const canAcquire = Boolean(hud?.isPlayer && hud.xp >= hud.xpCost);
  const previewName = pieceName.trim() || `Custom ${pieceType}`;
  const editorRange = hud?.editorRange || 3;
  const editorDiameter = editorRange * 2 + 1;

  return (
    <>
      <div className="freezone-hud" aria-live="polite">
        {hud && (
          <span className="freezone-hud-stats">
            XP {hud.xp} · Army {hud.pieces}/{hud.capacity}
          </span>
        )}
        <button
          type="button"
          className="hud-btn freezone-open"
          onClick={() => {
            setStatus('');
            setOpen(true);
          }}
        >
          {hud ? 'Piece Shop' : 'Freezone Arena'}
        </button>
      </div>

      <div
        className={`freezone-overlay ${open ? 'open' : ''}`}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      >
        <section
          className="freezone-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="freezone-title"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="freezone-close"
            onClick={() => setOpen(false)}
            aria-label="Close Freezone"
          >
            ×
          </button>
          <p className="freezone-eyebrow">SHARED REAL-TIME ARENA · UP TO 10 PLAYERS</p>
          <h2 id="freezone-title">{hud ? 'Freezone Piece Shop' : 'Freezone Arena'}</h2>

          {hud ? (
            <>
              <p className="freezone-description">
                Collect the colored orbs by landing on their tile. Piece purchases cost {hud.xpCost} XP.
                Purple orbs expand your army; when it is full, select a piece to replace.
              </p>
              <div className="freezone-summary">
                <span><strong>{hud.xp}</strong> XP</span>
                <span><strong>{hud.pieces}/{hud.capacity}</strong> pieces</span>
                <span><strong>{hud.xpCost}</strong> XP per piece</span>
                <span>
                  <strong>
                    {hud.cooldownMs > 0
                      ? `${Math.ceil(hud.cooldownMs / 1000)}s`
                      : `${Math.max(0, hud.movesPerCycle - hud.movesUsed)}/${hud.movesPerCycle}`}
                  </strong>
                  {hud.cooldownMs > 0 ? ' resting' : ' moves left'}
                </span>
                <span><strong>{(hud.cooldownDurationMs / 1000).toFixed(1)}s</strong> cooldown</span>
                <span><strong>±{hud.editorRange}</strong> editor reach</span>
                {roomCode && (
                  <button type="button" onClick={() => void copyRoomCode()}>
                    Arena {roomCode} · Copy
                  </button>
                )}
              </div>
              <div
                className="freezone-xp-progress"
                role="progressbar"
                aria-label="Progress toward the next piece purchase"
                aria-valuemin={0}
                aria-valuemax={hud.xpCost}
                aria-valuenow={hud.xpProgress}
              >
                <span style={{ width: `${(hud.xpProgress / hud.xpCost) * 100}%` }} />
              </div>
              <p className="freezone-hint">
                {hud.xpProgress}/{hud.xpCost} XP toward the next piece · {hud.movesPerCycle} moves per cycle
              </p>
              <p className="freezone-hint">
                Upgrade levels: Red {hud.upgradeLevels.red} · Yellow {hud.upgradeLevels.yellow} ·
                Purple {hud.upgradeLevels.purple} · White {hud.upgradeLevels.white}
              </p>
              {!hud.isPlayer ? (
                <p className="freezone-hint">Spectators cannot buy or upgrade pieces.</p>
              ) : hud.xp < hud.xpCost ? (
                <p className="freezone-hint">Collect {hud.xpCost - hud.xp} more XP to buy a piece.</p>
              ) : hud.pieces >= hud.capacity ? (
                <p className="freezone-hint">Army full: choose a non-king piece to replace or collect a purple orb.</p>
              ) : null}
              <div className="freezone-orb-guide" aria-label="Orb effects">
                {hud.orbEffects.map((orb) => (
                  <span key={orb.type}>
                    <i style={{ backgroundColor: orb.color }} />
                    <strong>{orb.label}</strong> {orb.description}
                    {orb.type !== 'xp' && <small>Lv {hud.upgradeLevels[orb.type]}</small>}
                  </span>
                ))}
              </div>
              <div className="freezone-tabs" role="tablist" aria-label="Piece options">
                <button
                  type="button"
                  className={!designMode ? 'selected' : ''}
                  aria-pressed={!designMode}
                  onClick={() => setDesignMode(false)}
                >
                  Available patterns
                </button>
                <button
                  type="button"
                  className={designMode ? 'selected' : ''}
                  aria-pressed={designMode}
                  onClick={() => setDesignMode(true)}
                >
                  Design a pattern
                </button>
              </div>

              {pendingReplacement && (
                <div className="freezone-replacement">
                  <p>
                    Choose a non-king piece to replace with {pendingReplacement.name}.
                    The purchase costs {hud.xpCost} XP.
                  </p>
                  {hud.ownedPieces.map((piece) => (
                    <button
                      type="button"
                      key={piece.id}
                      disabled={purchaseBusy || piece.type === 'king'}
                      onClick={() => void acquirePiece(pendingReplacement, piece.id)}
                    >
                      Replace {piece.name}{piece.title ? ` · ${piece.title}` : ''}
                      {piece.type === 'king' ? ' · King cannot be replaced' : ''}
                    </button>
                  ))}
                  <button type="button" onClick={() => setPendingReplacement(null)}>
                    Cancel
                  </button>
                </div>
              )}

              {!designMode ? (
                <div className="freezone-pattern-list">
                  {hud.pieceOptions.map((pattern) => (
                    <article className="freezone-pattern" key={pattern.id}>
                      <div>
                        <strong>{pattern.name}</strong>
                        {pattern.title && <span>{pattern.title}</span>}
                        {pattern.catchphrase && <span>“{pattern.catchphrase}”</span>}
                        <span>{movementText(pattern.moves, pattern.jumps, pattern.slide)}</span>
                      </div>
                      <button
                        type="button"
                        disabled={!canAcquire || purchaseBusy}
                        onClick={() => void acquirePiece(pattern)}
                      >
                        {hud.pieces >= hud.capacity ? 'Replace' : 'Acquire'} · {hud.xpCost} XP
                      </button>
                    </article>
                  ))}
                  {!hud.pieceOptions.length && (
                    <p className="freezone-empty">No piece patterns are available in this arena.</p>
                  )}
                </div>
              ) : (
                <div className="freezone-designer">
                  <div className="freezone-designer-fields">
                    <label>
                      Piece model
                      <select value={pieceType} onChange={(event) => setPieceType(event.target.value as PieceType)}>
                        {PIECE_TYPES.map((piece) => (
                          <option key={piece.type} value={piece.type}>{piece.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Pattern name
                      <input
                        value={pieceName}
                        maxLength={32}
                        placeholder={`Custom ${pieceType}`}
                        onChange={(event) => setPieceName(event.target.value)}
                      />
                    </label>
                    <label>
                      Role / title
                      <input
                        value={pieceTitle}
                        maxLength={32}
                        placeholder="General"
                        onChange={(event) => setPieceTitle(event.target.value)}
                      />
                    </label>
                    <label>
                      Catchphrase
                      <input
                        value={pieceCatchphrase}
                        maxLength={120}
                        placeholder="Always defeats my opponents"
                        onChange={(event) => setPieceCatchphrase(event.target.value)}
                      />
                    </label>
                  </div>
                  <p className="freezone-hint">
                    Editor reach: up to ±{editorRange} tiles in each direction. This does not change the physical board size.
                  </p>
                  <div
                    className="freezone-preview-board"
                    role="group"
                    aria-label="Movement pattern preview"
                    style={{ gridTemplateColumns: `repeat(${editorDiameter}, minmax(0, 1fr))` }}
                  >
                    {Array.from({ length: editorDiameter * editorDiameter }, (_, index) => {
                      const row = Math.floor(index / editorDiameter);
                      const col = index % editorDiameter;
                      const offsetRow = editorRange - row;
                      const offsetCol = col - editorRange;
                      const center = offsetRow === 0 && offsetCol === 0;
                      const selected = selectedMoves.some(
                        ([moveRow, moveCol]) => moveRow === offsetRow && moveCol === offsetCol
                      );
                      const step = selectedMoves.findIndex(
                        ([moveRow, moveCol]) => moveRow === offsetRow && moveCol === offsetCol
                      );
                      const jump = selectedJumps.some(
                        ([moveRow, moveCol]) => moveRow === offsetRow && moveCol === offsetCol
                      );
                      return (
                        <button
                          key={`${offsetRow},${offsetCol}`}
                          type="button"
                          className={`${center ? 'center' : ''} ${selected ? 'selected' : ''} ${jump ? 'jump' : ''}`}
                          disabled={center}
                          aria-label={center ? 'Piece starting square' : `Move ${offsetRow}, ${offsetCol}`}
                          aria-pressed={selected}
                          onClick={() => toggleMove(offsetRow, offsetCol)}
                        >
                          {center ? '●' : selected ? String(step + 1) : ''}
                        </button>
                      );
                    })}
                  </div>
                  <p className="freezone-move-legend">
                    <span><i className="ordinary" /> Ordinary move</span>
                    <span><i className="jump" /> Jump (click a selected square twice)</span>
                  </p>
                  <label className="freezone-slide">
                    <input type="checkbox" checked={slide} onChange={(event) => setSlide(event.target.checked)} />
                    Slide along each selected direction
                  </label>
                  <p className="freezone-hint">
                    {selectedMoves.length
                      ? movementText(selectedMoves, selectedJumps, slide)
                      : 'Choose at least one reachable square.'}
                  </p>
                  <button
                    type="button"
                    className="freezone-design-acquire"
                    disabled={!canAcquire || purchaseBusy || selectedMoves.length === 0}
                    onClick={() => void acquirePiece({
                      name: previewName,
                      title: pieceTitle.trim(),
                      catchphrase: pieceCatchphrase.trim(),
                      type: pieceType,
                      moves: selectedMoves,
                      jumps: selectedJumps,
                      slide
                    })}
                  >
                    {hud.pieces >= hud.capacity ? 'Design & replace' : 'Design & acquire'} · {hud.xpCost} XP
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="freezone-description">
                Create a persistent shared arena or join a friend. Players enter the same open world,
                collect XP, and build their own piece movement patterns.
              </p>
              <div className="freezone-room-list" aria-live="polite">
                <h3>Available Freezone rooms</h3>
                {roomsLoading && !rooms.length && <p className="freezone-empty">Finding the shared arena…</p>}
                {!roomsLoading && !rooms.length && <p className="freezone-empty">No active Freezone rooms found.</p>}
                {rooms.map((room) => (
                  <article className="freezone-room" key={room.id}>
                    <div>
                      <strong>{room.name}{room.isMainArena ? ' · Main' : ''}</strong>
                      <span>{room.joined}/{room.capacity} players · Code {room.code}</span>
                    </div>
                    <button
                      type="button"
                      disabled={busy || room.joined >= room.capacity}
                      onClick={() => void joinArenaCode(room.code)}
                    >
                      {room.joined >= room.capacity ? 'Full' : 'Join'}
                    </button>
                  </article>
                ))}
              </div>
              <button
                type="button"
                className="freezone-create"
                disabled={busy}
                onClick={() => void createArena()}
              >
                {busy ? 'Connecting...' : 'Create a 10-player arena'}
              </button>
              <form className="freezone-join" onSubmit={(event) => void joinArena(event)}>
                <label htmlFor="freezone-code">Join an arena by code</label>
                <div>
                  <input
                    id="freezone-code"
                    value={joinCode}
                    maxLength={4}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="ABCD"
                    onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  />
                  <button type="submit" disabled={busy || joinCode.length !== 4}>
                    {busy ? 'Joining...' : 'Join'}
                  </button>
                </div>
              </form>
            </>
          )}
          <p className="freezone-status" aria-live="polite">{status}</p>
        </section>
      </div>
      <div className={`freezone-toast ${notice ? 'visible' : ''}`} role="status" aria-live="assertive">
        {notice}
      </div>
    </>
  );
}
