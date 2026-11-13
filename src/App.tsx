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
type FreezoneUpgrade = 'red' | 'blue' | 'yellow' | 'purple' | 'white';
type FreezoneAllyRole = 'strategic' | 'offensive' | 'defensive' | 'guardian' | 'collector';
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
    pattern: Omit<FreezonePattern, 'id'> | FreezonePattern,
    replacementId?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  buyFreezoneAlly?: (role: FreezoneAllyRole) => Promise<{ ok: boolean; error?: string }>;
  upgradeFreezoneSkill?: (type: FreezoneUpgrade) => Promise<{ ok: boolean; error?: string }>;
  upgradeFreezoneEnvelope?: (rows: number, cols: number) => Promise<{ ok: boolean; error?: string }>;
  unlockFreezoneMovement?: (
    pieceId: string,
    row: number,
    col: number,
    kind: 'drag' | 'jump' | 'teleport',
    scopeRows: number,
    scopeCols: number,
    targetA: number
  ) => Promise<{ ok: boolean; error?: string; addedOffset?: boolean }>;
  setFreezoneBotsEnabled?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>;
  setFreezoneSharedMusicUrl?: (url: string) => Promise<{ ok: boolean; error?: string }>;
  setFreezoneSharedMusicPlaying?: (playing: boolean) => Promise<{ ok: boolean; error?: string }>;
  leaveCurrentGame?: () => void;
};

declare global {
  interface Window {
    wizardChess?: MultiplayerApi;
  }
}

export default function App() {
  const initializedRef = useRef(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(true);
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
      setMainMenuOpen(false);
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
    const handleFreezoneState = (event: Event) => {
      const state = (event as CustomEvent<{ enabled?: boolean }>).detail;
      if (state?.enabled) {
        setMainMenuOpen(false);
        setMultiplayerOpen(false);
      }
    };
    window.addEventListener('wizard-chess-room-state', handleRoomState);
    window.addEventListener('wizard-chess-open-multiplayer', handleInvite);
    window.addEventListener('wizard-chess-multiplayer-status', handleMultiplayerStatus);
    window.addEventListener('wizard-chess-freezone-state', handleFreezoneState);
    return () => {
      window.removeEventListener('wizard-chess-room-state', handleRoomState);
      window.removeEventListener('wizard-chess-open-multiplayer', handleInvite);
      window.removeEventListener('wizard-chess-multiplayer-status', handleMultiplayerStatus);
      window.removeEventListener('wizard-chess-freezone-state', handleFreezoneState);
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
      setMainMenuOpen(false);
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

  const returnToMainMenu = () => {
    setMobileSheetOpen(false);
    setMultiplayerOpen(false);
    setModeCreatorOpen(false);
    setMainMenuOpen(true);
    setRoomCode('');
    setMultiplayerStatus('');
    const leaveCurrentGame = window.wizardChess?.leaveCurrentGame;
    if (leaveCurrentGame) {
      leaveCurrentGame();
    } else {
      setMultiplayerStatus('Game services are still starting. You are back at the menu.');
    }
  };

  const handleRestoreUI = () => {
    const win = window as unknown as { wizardChess?: { toggleUI?: (force?: boolean) => void } };
    if (win.wizardChess?.toggleUI) {
      win.wizardChess.toggleUI(false);
    } else {
      document.body.classList.remove('cinematic-ui-hidden');
      const btnHide = document.getElementById('btn-hide-ui');
      if (btnHide) {
        btnHide.setAttribute('aria-label', 'Hide HUD controls');
        btnHide.title = 'Hide HUD controls (Shortcut: H)';
      }
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
        className="hud-btn ui-restore-btn hud-icon-button"
        id="btn-mobile-show-ui"
        onClick={handleRestoreUI}
        aria-label="Show HUD controls"
        title="Show HUD Controls"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="2.7" />
        </svg>
      </button>

      <div id="hud-top">
        <div className="hud-group" id="hud-left">
          <div className="status-pill" id="status-pill">
            <span className="turn-dot" id="turn-dot"></span>
            <span id="turn-text">White to Move</span>
            <span className="mode-badge" id="mode-badge">Playing as White</span>
          </div>
        </div>

        {!mainMenuOpen && (
          <button
            type="button"
            className="hud-btn return-menu-btn hud-icon-button"
            id="btn-main-menu"
            onClick={returnToMainMenu}
            title="Leave this game and return to the main menu"
            aria-label="Back to Menu"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 10 9-7 9 7" />
              <path d="M5.5 9v11h13V9M9.5 20v-7h5v7" />
            </svg>
          </button>
        )}

        <button
          type="button"
          className={`hud-btn mobile-controls-trigger ${mobileSheetOpen ? 'active' : ''}`}
          id="btn-mobile-controls"
          aria-expanded={mobileSheetOpen}
          aria-controls="hud-right"
          onClick={() => setMobileSheetOpen((prev) => !prev)}
          aria-label={mobileSheetOpen ? 'Close controls' : 'Open controls'}
          title={mobileSheetOpen ? 'Close controls' : 'Open controls'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {mobileSheetOpen
              ? <path d="m6 6 12 12M18 6 6 18" />
              : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
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

          <button
            type="button"
            className="hud-btn free-block-toggle hud-icon-button"
            id="btn-free-blocks"
            style={{ display: 'none' }}
            aria-label="Remove Blocks"
            title="Remove Blocks"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
              <path d="m4.5 7.5 7.5 4 7.5-4M12 12v9M8.5 5l7.5 4.5" />
            </svg>
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
          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">Camera Views</div>

          <div className="camera-preset-group" aria-label="Camera controls">
            <label className="camera-preset-label" htmlFor="camera-preset-select" aria-label="Camera">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 7h3l1.5-2h9L18 7h3v12H3V7Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </label>
            <select
              className="hud-btn camera-preset-select"
              id="camera-preset-select"
              aria-label="Choose camera view"
              defaultValue="player"
            >
              <option value="custom" disabled>Custom view</option>
              <option value="player">Player Cam</option>
              <option value="top">Overhead</option>
              <option value="side">Side</option>
              <option value="wide">Cathedral</option>
            </select>
          </div>

          <div className="hud-divider" aria-hidden="true"></div>
          <div className="mobile-sheet-section-label">Display &amp; Gestures</div>

          <button
            className="hud-btn"
            id="btn-hide-ui"
            title="Hide HUD controls (Shortcut: H)"
            aria-label="Hide HUD controls"
            onClick={() => setMobileSheetOpen(false)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
              <circle cx="12" cy="12" r="2.7" />
            </svg>
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

      <div className={`main-menu-overlay ${mainMenuOpen ? 'open' : ''}`} aria-hidden={!mainMenuOpen}>
        <section className="main-menu-dialog" aria-labelledby="main-menu-title">
          <p className="main-menu-eyebrow">SANCTUM · CHOOSE YOUR GAME</p>
          <h1 id="main-menu-title">Wizard Chess</h1>
          <p className="main-menu-description">Choose how you want to play.</p>
          <div className="main-menu-actions">
            <button
              type="button"
              className="main-menu-choice primary"
              onClick={() => {
                setMultiplayerStatus('');
                setMultiplayerOpen(true);
              }}
            >
              Multiplayer
            </button>
            <button
              type="button"
              className="main-menu-choice"
              onClick={() => window.dispatchEvent(new Event('wizard-chess-open-freezone'))}
            >
              Freezone
            </button>
            <button
              type="button"
              className="main-menu-choice"
              id="btn-reset"
              onClick={() => {
                setMultiplayerStatus('');
                setMainMenuOpen(false);
              }}
            >
              Test Mode
            </button>
            <button
              type="button"
              className="main-menu-choice free-mode-toggle"
              onClick={() => {
                setMultiplayerStatus('');
                setMainMenuOpen(false);
              }}
            >
              Free Mode
            </button>
            <button
              type="button"
              className="main-menu-choice"
              onClick={() => setModeCreatorOpen(true)}
            >
              Mode Creator
            </button>
          </div>
          {multiplayerStatus && (
            <p className="main-menu-status" aria-live="polite">{multiplayerStatus}</p>
          )}
        </section>
      </div>

      <FreezonePanel mainMenuOpen={mainMenuOpen} />

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
            setMainMenuOpen(false);
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
