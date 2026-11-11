import { useEffect, useRef, useState } from 'react';
import { initWizardChess } from './wizardChessEngine.js';
import ModeCreator, { type CustomGameMode } from './ModeCreator';
import FreezonePanel, { type FreezonePattern } from './FreezonePanel';

type MultiplayerResult = { ok: boolean; code?: string; error?: string };
type RoomState = { code: string; whiteJoined: boolean; blackJoined: boolean };
type CreatorRoom = {
  id: string;
  code: string;
  status: string;
  name: string;
  joined: number;
  capacity: number;
};
type MultiplayerAction = () => Promise<MultiplayerResult> | undefined;
type MultiplayerApi = {
  createMultiplayerRoom?: (color: 'w' | 'b') => Promise<MultiplayerResult>;
  joinMultiplayerRoom?: (code: string) => Promise<MultiplayerResult>;
  quickMatch?: () => Promise<MultiplayerResult>;
  startCustomGame?: (config: CustomGameMode) => void;
  createCustomRoom?: (config: CustomGameMode) => Promise<MultiplayerResult>;
  createFreezoneRoom?: () => Promise<MultiplayerResult>;
  joinFreezoneRoom?: (code: string) => Promise<MultiplayerResult>;
  listFreezoneRooms?: () => Promise<Array<CreatorRoom & { kind: string; isMainArena: boolean }>>;
  ensureFreezoneMainRoom?: () => Promise<CreatorRoom & { kind: string; isMainArena: boolean }>;
  listCustomRooms?: () => Promise<CreatorRoom[]>;
  buyFreezonePiece?: (
    pattern: Omit<FreezonePattern, 'id'> | FreezonePattern
  ) => { ok: boolean; error?: string };
};

declare global {
  interface Window {
    wizardChess?: MultiplayerApi;
  }
}

export default function App() {
  const initializedRef = useRef(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(
    () => Boolean(new URLSearchParams(window.location.search).get('room'))
  );
  const [joinCode, setJoinCode] = useState(
    () => new URLSearchParams(window.location.search).get('room') || ''
  );
  const [roomCode, setRoomCode] = useState('');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>('w');
  const [multiplayerStatus, setMultiplayerStatus] = useState('');
  const [multiplayerBusy, setMultiplayerBusy] = useState(false);
  const [modeCreatorOpen, setModeCreatorOpen] = useState(false);
  const [creatorRooms, setCreatorRooms] = useState<CreatorRoom[]>([]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    initWizardChess();
  }, []);

  useEffect(() => {
    if (!multiplayerOpen) return;
    let active = true;
    const refreshRooms = async () => {
      try {
        const nextRooms = await window.wizardChess?.listCustomRooms?.();
        if (active && nextRooms) setCreatorRooms(nextRooms);
      } catch (error) {
        if (active) {
          setMultiplayerStatus(error instanceof Error ? error.message : 'Could not load custom rooms.');
        }
      }
    };
    void refreshRooms();
    const timer = window.setInterval(() => void refreshRooms(), 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [multiplayerOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileSheetOpen(false);
        setMultiplayerOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileSheetOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const handleRoomState = (event: Event) => {
      const room = (event as CustomEvent<RoomState>).detail;
      if (!room) return;
      setRoomCode(room.code);
      setMultiplayerStatus(
        room.whiteJoined && room.blackJoined
          ? 'Both players are connected. Your game is synced.'
          : `Room ${room.code} is ready. Waiting for the other player.`
      );
    };
    const handleInvite = (event: Event) => {
      const code = (event as CustomEvent<string>).detail || '';
      setJoinCode(code);
      setMultiplayerStatus(code ? `Joining room ${code}...` : '');
      setMultiplayerOpen(true);
    };
    const handleMultiplayerStatus = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) setMultiplayerStatus(message);
    };
    window.addEventListener('wizard-chess-room-state', handleRoomState);
    window.addEventListener('wizard-chess-open-multiplayer', handleInvite);
    window.addEventListener('wizard-chess-multiplayer-status', handleMultiplayerStatus);
    return () => {
      window.removeEventListener('wizard-chess-room-state', handleRoomState);
      window.removeEventListener('wizard-chess-open-multiplayer', handleInvite);
      window.removeEventListener('wizard-chess-multiplayer-status', handleMultiplayerStatus);
    };
  }, []);

  const runMultiplayerAction = async (
    action: MultiplayerAction | undefined,
    progressText: string
  ): Promise<string | undefined> => {
    if (!action) {
      setMultiplayerStatus('Multiplayer is still starting. Try again in a moment.');
      return;
    }
    setMultiplayerBusy(true);
    setMultiplayerStatus(progressText);
    try {
      const result = await action();
      if (!result) {
        setMultiplayerStatus('Multiplayer is still starting. Try again in a moment.');
        return;
      }
      if (!result.ok) {
        setMultiplayerStatus(result.error || 'Could not connect to the room.');
        return;
      }
      if (result.code) setRoomCode(result.code);
      setMultiplayerStatus(
        result.code
          ? `Room ${result.code} is ready. Share the code with your opponent.`
          : 'Multiplayer room ready.'
      );
      return result.code;
    } catch (error) {
      setMultiplayerStatus(error instanceof Error ? error.message : 'Could not connect to the room.');
    } finally {
      setMultiplayerBusy(false);
    }
  };

  const copyRoomText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMultiplayerStatus(successMessage);
    } catch {
      setMultiplayerStatus('Clipboard access failed. Select and copy the room code.');
    }
  };

  const handleRestoreUI = () => {
    const win = window as unknown as { wizardChess?: { toggleUI?: (force?: boolean) => void } };
    if (win.wizardChess?.toggleUI) {
      win.wizardChess.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) btnHide.textContent = 'Hide UI [H]';
    }
  };

  return (
    <>
      <div id="loading-overlay">
        <div className="loader-title">Wizard Chess</div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" id="loader-bar"></div>
        </div>
        <div id="loader-text">Summoning Sanctum Architecture &amp; Sculpted Pieces...</div>
      </div>

      <div id="canvas-container"></div>

      <button
        type="button"
        className="hud-btn mobile-only-restore-ui"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        title="Show HUD Controls"
      >
        Show UI
      </button>

      <div id="hud-top">
        <div className="hud-group" id="hud-left">
          <div className="brand-pill">
            <span className="brand-title">Wizard Chess</span>
          </div>
          <div className="status-pill" id="status-pill">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">White to Move</span>
            <span className="mode-badge" id="mode-badge">Playing as White</span>
          </div>
          <button type="button" className="hud-btn free-mode-toggle">
            Free Mode
          </button>
          <FreezonePanel />
          <button type="button" className="hud-btn free-block-toggle" style={{ display: 'none' }}>
            Remove Blocks
          </button>
          <button type="button" className="hud-btn" onClick={() => setModeCreatorOpen(true)}>
            Mode Creator
          </button>
          <button
            type="button"
            className="hud-btn multiplayer-trigger"
            onClick={() => setMultiplayerOpen(true)}
          >
            Multiplayer
          </button>
        </div>

        <button
          type="button"
          className={`hud-btn mobile-controls-trigger ${mobileSheetOpen ? 'active' : ''}`}
          id="btn-mobile-controls"
          aria-expanded={mobileSheetOpen}
          aria-controls="hud-right"
          onClick={() => setMobileSheetOpen((prev) => !prev)}
        >
          {mobileSheetOpen ? 'Close' : 'Controls'}
        </button>

        <div
          className={`mobile-sheet-backdrop ${mobileSheetOpen ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMobileSheetOpen(false);
          }}
          aria-hidden="true"
        ></div>

        <div
          className={`hud-group ${mobileSheetOpen ? 'mobile-sheet-open' : ''}`}
          id="hud-right"
        >
          <div
            className="mobile-sheet-handle-wrap"
            onClick={(e) => {
              e.stopPropagation();
              setMobileSheetOpen(false);
            }}
            aria-hidden="true"
          >
            <div className="mobile-sheet-handle"></div>
          </div>

          <div className="mobile-sheet-header">
            <span className="mobile-sheet-title">Controls</span>
            <button
              type="button"
              className="mobile-sheet-close"
              id="btn-mobile-sheet-close"
              onClick={(e) => {
                e.stopPropagation();
                setMobileSheetOpen(false);
              }}
              aria-label="Close Controls"
            >
              Close ✕
            </button>
          </div>

          <div className="mobile-sheet-section-label">Game Actions</div>

          <button
            type="button"
            className="hud-btn multiplayer-mobile-trigger"
            onClick={() => {
              setMultiplayerOpen(true);
              setMobileSheetOpen(false);
            }}
          >
            Multiplayer
          </button>
          <button type="button" className="hud-btn free-mode-toggle">
            Free Mode
          </button>
          <button type="button" className="hud-btn free-block-toggle" style={{ display: 'none' }}>
            Remove Blocks
          </button>
          <button type="button" className="hud-btn" onClick={() => {
            setModeCreatorOpen(true);
            setMobileSheetOpen(false);
          }}>
            Mode Creator
          </button>
          <button
            className="hud-btn"
            id="btn-side-toggle"
            title="Switch between Playing as White and Playing as Black"
            onClick={() => setMobileSheetOpen(false)}
          >
            Play as Black
          </button>
          <button
            className="hud-btn"
            id="btn-ai-move"
            title="Let the AI make the next move immediately"
            onClick={() => setMobileSheetOpen(false)}
          >
            AI Move
          </button>
          <button
            className="hud-btn"
            id="btn-reset"
            title="Start a fresh game on the altar"
            onClick={() => setMobileSheetOpen(false)}
          >
            New Game
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">
            <span>Camera Views</span>
            <span className="mobile-sheet-section-sub">Tap active view to flip</span>
          </div>

          <button
            className="hud-btn active"
            id="btn-cam-player"
            title="Player Camera (Click again to flip White / Black view)"
          >
            Player Cam
          </button>
          <button
            className="hud-btn"
            id="btn-cam-top"
            title="Overhead Board View (Click again to flip White / Black orientation)"
          >
            Overhead
          </button>
          <button
            className="hud-btn"
            id="btn-cam-side"
            title="Side Profile View (Click again to switch East / West side)"
          >
            Side
          </button>
          <button
            className="hud-btn"
            id="btn-cam-wide"
            title="Wide Cathedral View (Click again to switch North Rose / South Narthex)"
          >
            Cathedral
          </button>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">Display &amp; Gestures</div>

          <button
            className="hud-btn"
            id="btn-hide-ui"
            title="Toggle HUD visibility (Shortcut: H)"
            onClick={() => setMobileSheetOpen(false)}
          >
            Hide UI [H]
          </button>

          <div className="mobile-sheet-hint">
            <strong>Touch:</strong> Tap Piece to Move &nbsp;•&nbsp; 1-Finger Drag: Orbit &nbsp;•&nbsp; 2-Finger Drag: Pan &nbsp;•&nbsp; Pinch: Zoom
          </div>
        </div>
      </div>

      <div id="hud-bottom">
        <div className="hint-pill" id="controls-hint">
          <strong>Controls:</strong> Click Piece to Move &nbsp;•&nbsp; Left-Drag: Orbit &nbsp;•&nbsp; Right-Drag: Pan &nbsp;•&nbsp; Scroll: Zoom &nbsp;•&nbsp; WASD + R/F: Fly Cam &nbsp;•&nbsp; H: Hide UI
        </div>
        <div className="captured-pill" id="captured-tray"></div>
      </div>

      <div
        className={`multiplayer-overlay ${multiplayerOpen ? 'open' : ''}`}
        aria-hidden={!multiplayerOpen}
        onClick={() => setMultiplayerOpen(false)}
      >
        <section
          className="multiplayer-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="multiplayer-title"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="multiplayer-close"
            onClick={() => setMultiplayerOpen(false)}
            aria-label="Close multiplayer menu"
          >
            ×
          </button>
          <p className="multiplayer-eyebrow">PLAY WITH A FRIEND</p>
          <h2 id="multiplayer-title">Multiplayer</h2>
          <p className="multiplayer-description">
            Find an opponent or create a private room and share its code.
          </p>

          <button
            type="button"
            className="multiplayer-action primary"
            disabled={multiplayerBusy}
            onClick={() => runMultiplayerAction(
              () => window.wizardChess?.quickMatch?.(),
              'Searching for an opponent...'
            )}
          >
            {multiplayerBusy ? 'Connecting...' : 'Find a Match'}
          </button>

          <div className="multiplayer-divider"><span>OR INVITE BY CODE</span></div>

          <div className="multiplayer-colors" aria-label="Choose your color">
            <button
              type="button"
              className={playerColor === 'w' ? 'selected' : ''}
              aria-pressed={playerColor === 'w'}
              onClick={() => setPlayerColor('w')}
            >
              White
            </button>
            <button
              type="button"
              className={playerColor === 'b' ? 'selected' : ''}
              aria-pressed={playerColor === 'b'}
              onClick={() => setPlayerColor('b')}
            >
              Black
            </button>
          </div>
          <button
            type="button"
            className="multiplayer-action"
            disabled={multiplayerBusy}
            onClick={() => runMultiplayerAction(
              () => window.wizardChess?.createMultiplayerRoom?.(playerColor),
              'Creating a private room...'
            )}
          >
            Create Invite Room
          </button>

          <form
            className="multiplayer-join"
            onSubmit={(event) => {
              event.preventDefault();
              void runMultiplayerAction(
                () => window.wizardChess?.joinMultiplayerRoom?.(joinCode.trim().toUpperCase()),
                `Joining room ${joinCode.trim().toUpperCase()}...`
              );
            }}
          >
            <label htmlFor="multiplayer-code">Room code</label>
            <div className="multiplayer-join-row">
              <input
                id="multiplayer-code"
                value={joinCode}
                maxLength={4}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="ABCD"
                onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button type="submit" className="multiplayer-action" disabled={multiplayerBusy || joinCode.length !== 4}>
                Join
              </button>
            </div>
          </form>

          <div className="creator-room-list" aria-live="polite">
            <h3>Creator rooms</h3>
            {!creatorRooms.length && <p>No active creator rooms found.</p>}
            {creatorRooms.map((room) => (
              <button
                type="button"
                className="creator-room"
                key={room.id}
                disabled={multiplayerBusy || room.joined >= room.capacity}
                onClick={() => void runMultiplayerAction(
                  () => window.wizardChess?.joinMultiplayerRoom?.(room.code),
                  `Joining ${room.name}…`
                )}
              >
                <span><strong>{room.name}</strong><small>{room.joined}/{room.capacity} players · {room.code}</small></span>
                <span>{room.joined >= room.capacity ? 'Full' : 'Join'}</span>
              </button>
            ))}
          </div>

          {roomCode && (
            <div className="multiplayer-room-code">
              <span>YOUR ROOM CODE</span>
              <strong>{roomCode}</strong>
              <div>
                <button
                  type="button"
                  onClick={() => void copyRoomText(roomCode, 'Room code copied. Send it to your opponent.')}
                >
                  Copy code
                </button>
                <button
                  type="button"
                  onClick={() => void copyRoomText(
                    `${window.location.origin}${window.location.pathname}?room=${roomCode}`,
                    'Invite link copied.'
                  )}
                >
                  Copy invite link
                </button>
              </div>
            </div>
          )}

          <p className="multiplayer-status" aria-live="polite">{multiplayerStatus}</p>
        </section>
      </div>

      <ModeCreator
        open={modeCreatorOpen}
        onClose={() => setModeCreatorOpen(false)}
        onStart={(config, multiplayer) => {
          if (!multiplayer) {
            window.wizardChess?.startCustomGame?.(config);
            setModeCreatorOpen(false);
            return;
          }
          const action = window.wizardChess?.createCustomRoom;
          if (!action) {
            setMultiplayerStatus('Multiplayer is still starting. Try again in a moment.');
            return;
          }
          void runMultiplayerAction(
            () => action(config),
            'Creating a custom game room...'
          ).then((code) => {
            if (!code) return;
            setModeCreatorOpen(false);
            setRoomCode(code);
            setMultiplayerOpen(true);
          });
        }}
      />

      <div id="checkmate-overlay" role="status" aria-live="polite">
        <div className="checkmate-banner">
          <div className="checkmate-ornament">✦ &nbsp; Sanctum Judgment &nbsp; ✦</div>
          <div className="checkmate-crown" id="checkmate-crown">♔</div>
          <div className="checkmate-title" id="checkmate-title">Checkmate</div>
          <div className="checkmate-rule"></div>
          <div className="checkmate-subtitle" id="checkmate-subtitle">
            White Triumphs • The Black King Has Fallen
          </div>
          <div className="checkmate-actions">
            <button className="checkmate-btn" id="btn-checkmate-replay">
              Replay King Fall
            </button>
            <button className="checkmate-btn" id="btn-checkmate-newgame">
              New Game
            </button>
            <button className="checkmate-btn secondary" id="btn-checkmate-dismiss">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
