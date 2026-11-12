import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  FREEZONE_AI_LANGUAGES,
  FREEZONE_AI_VOICES,
  FREEZONE_APPEARANCES,
  FREEZONE_VOICE_EVENTS,
  getFreezoneEliminationLeaders,
  incrementFreezoneEliminations,
  mergeFreezoneRoomState,
  resolveFreezoneVoice,
  sanitizeFreezoneAIHistory,
  sanitizeFreezoneAIDialogue,
  sanitizeFreezoneProfile,
  shouldSpeakFreezoneVoice
} from '../src/freezoneCustomization.js';
import {
  clearFreezoneAIKeys,
  getFreezoneAIRequestSettings,
  getFreezoneAISettings,
  updateFreezoneAISettings
} from '../src/freezoneAISettings.js';
import {
  freezoneAICandidateId,
  normalizeFreezoneAIDecision,
  shouldRequestFreezoneAIVoice
} from '../src/freezoneAi.js';
import {
  FREEZONE_BOARD_SIZE,
  FREEZONE_MUTANT_DURATION_MS,
  FREEZONE_ORB_TARGET_COUNT,
  advanceFreezoneMutantZone,
  canUpgradeFreezoneEnvelope,
  computeFreezoneMoves,
  createFreezoneMutantZone,
  generateFreezoneOrbPositions,
  freezoneCapturePhase,
  freezoneFocusPose,
  normalizeFreezoneMutantZone,
  validateFreezoneAudioFile,
  validateFreezoneAudioUrl
} from '../src/freezoneRules.js';

const ROOT = process.cwd();

test('Simplified Single-Player HUD in src/App.tsx excludes speed sliders, notation script bar, and multiplayer lobby', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');

  // Must include simplified game & camera controls
  for (const requiredId of [
    'btn-side-toggle',
    'btn-ai-move',
    'btn-reset',
    'camera-preset-select',
    'btn-hide-ui',
    'controls-hint',
    'captured-tray'
  ]) {
    assert.ok(appTsx.includes(`id="${requiredId}"`), `Missing required HUD control #${requiredId}`);
  }

  // Must NOT include camera speed sliders, script mode bar, or multiplayer lobby
  for (const forbiddenId of [
    'cam-speed-wrap',
    'input-cam-speed',
    'rot-speed-wrap',
    'input-rot-speed',
    'script-bar',
    'btn-script-modal',
    'btn-script-prev',
    'btn-script-next',
    'btn-lobby',
    'lobby-modal',
    'room-pill',
    'btn-checkmate-stepback'
  ]) {
    assert.ok(!appTsx.includes(forbiddenId), `Forbidden UI element #${forbiddenId} found in App.tsx`);
  }
});

test('Main menu orders multiplayer first and keeps mode actions out of the in-game controls', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const menuStart = appTsx.indexOf('className={`main-menu-overlay');
  const menuEnd = appTsx.indexOf('className={`multiplayer-overlay', menuStart);
  const menu = appTsx.slice(menuStart, menuEnd);
  const controlsStart = appTsx.indexOf('id="hud-right"');
  const controlsEnd = appTsx.indexOf('id="hud-bottom"', controlsStart);
  const controls = appTsx.slice(controlsStart, controlsEnd);
  const optionOrder = [
    menu.indexOf('Multiplayer'),
    menu.indexOf('Freezone'),
    menu.indexOf('Test Mode'),
    menu.indexOf('Free Mode')
  ];

  assert.ok(menuStart >= 0 && menuEnd > menuStart);
  assert.ok(optionOrder.every((index) => index >= 0));
  assert.deepEqual(optionOrder, [...optionOrder].sort((a, b) => a - b));
  assert.ok(appTsx.includes('id="btn-main-menu"'));
  assert.ok(appTsx.includes('leaveCurrentGame()'));
  assert.ok(appTsx.includes("new Event('wizard-chess-open-freezone')"));
  assert.ok(appTsx.indexOf('<FreezonePanel mainMenuOpen={mainMenuOpen} />') >
    appTsx.indexOf('className={`main-menu-overlay'));
  for (const hiddenMode of ['Multiplayer', 'Free Mode', 'New Game', 'Mode Creator']) {
    assert.ok(!controls.includes(hiddenMode), `${hiddenMode} should not appear in in-game controls`);
  }
});

test('Camera views are selected from one control and preserve flip and free-look states', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');
  const engine = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');

  for (const preset of ['player', 'top', 'side', 'wide']) {
    assert.ok(appTsx.includes(`<option value="${preset}">`), `Missing camera option "${preset}"`);
  }
  assert.ok(appTsx.includes('id="camera-preset-select"'));
  assert.ok(engine.includes("setCameraPreset(event.currentTarget.value)"));
  assert.ok(engine.includes("setActiveCameraPreset('custom')"));
  assert.doesNotMatch(appTsx, /Flip View|btn-cam-flip/);
  assert.doesNotMatch(appTsx, /id="btn-cam-(player|top|side|wide)"/);
  assert.doesNotMatch(engine, /#btn-cam-(player|top|side|wide)/);
});

test('All 7 compressed 3D assets (.glb.gz.b64) decode and gunzip to valid glTF 2.0 binary models', () => {
  const expectedModels = [
    'option8_cathedral',
    'pawn_white',
    'rook_white',
    'knight_white',
    'bishop_white',
    'queen_white',
    'king_white'
  ];

  for (const name of expectedModels) {
    const b64Path = path.join(ROOT, 'public/assets/glb', `${name}.glb.gz.b64`);
    assert.ok(fs.existsSync(b64Path), `Missing 3D asset ${b64Path}`);
    const b64Text = fs.readFileSync(b64Path, 'utf-8').trim();
    assert.ok(b64Text.length > 1000, `Asset ${name}.glb.gz.b64 is unexpectedly small`);

    const gzBuf = Buffer.from(b64Text, 'base64');
    const glbBuf = zlib.gunzipSync(gzBuf);

    const magic = glbBuf.toString('ascii', 0, 4);
    const version = glbBuf.readUInt32LE(4);
    const totalLen = glbBuf.readUInt32LE(8);
    assert.equal(magic, 'glTF', `Invalid glTF magic header for ${name}`);
    assert.equal(version, 2, `Invalid glTF version for ${name}`);
    assert.equal(totalLen, glbBuf.length, `Mismatched glTF byte length for ${name}`);
  }
});

test('Freezone appearance selection and public profile are normalized for persistence', () => {
  assert.equal(FREEZONE_APPEARANCES.length, 10);
  const profile = sanitizeFreezoneProfile({
    appearance: 'dragon',
    name: '  Stanley  ',
    description: 'x'.repeat(200),
    personality: 'x'.repeat(300),
    language: 'invalid',
    aiVoice: 'invalid',
    voiceLines: { inspection: '  Welcome  ', unknown: 'ignored' }
  });
  assert.equal(profile.appearance, 'dragon');
  assert.equal(profile.name, 'Stanley');
  assert.equal(profile.description.length, 160);
  assert.equal(profile.personality.length, 240);
  assert.equal(profile.language, 'en-US');
  assert.equal(profile.aiVoice, 'alloy');
  assert.equal(profile.voiceLines.inspection, 'Welcome');
  assert.equal(profile.voiceLines.victory, '');
  assert.equal(sanitizeFreezoneProfile({ appearance: 'external-model' }).appearance, '');
  assert.ok(FREEZONE_AI_LANGUAGES.some(({ id }) => id === profile.language));
  assert.ok(FREEZONE_AI_VOICES.some(({ id }) => id === profile.aiVoice));
  assert.ok(FREEZONE_VOICE_EVENTS.some(({ id }) => id === 'move'));
  assert.ok(FREEZONE_VOICE_EVENTS.some(({ id }) => id === 'death'));
});

test('Freezone provider keys stay in session memory and Gemini Live is the default voice', () => {
  assert.equal(getFreezoneAISettings().voiceProvider, 'gemini-live');
  updateFreezoneAISettings({
    textProvider: 'gemini',
    voiceProvider: 'gemini-live',
    apiKeys: { gemini: '', openai: '', deepseek: '', google: '' }
  });
  assert.equal(getFreezoneAISettings().voiceProvider, 'gemini-live');
  updateFreezoneAISettings({
    textProvider: 'deepseek',
    voiceProvider: 'openai-tts',
    apiKeys: { deepseek: 'deepseek-session-key', openai: 'openai-session-key' }
  });
  assert.equal(getFreezoneAIRequestSettings().textProvider, 'deepseek');
  assert.equal(getFreezoneAIRequestSettings().textApiKey, 'deepseek-session-key');
  assert.equal(getFreezoneAIRequestSettings().voiceProvider, 'openai-tts');
  assert.equal(getFreezoneAIRequestSettings().voiceApiKey, 'openai-session-key');
  clearFreezoneAIKeys();
  assert.equal(getFreezoneAIRequestSettings().textApiKey, '');
  assert.equal(getFreezoneAIRequestSettings().voiceApiKey, '');
  assert.equal(getFreezoneAISettings().apiKeys.google, '');
});

test('Freezone room merge preserves synced profile and elimination fields', () => {
  const base = {
    pieces: [{ id: 'p1', r: 0, c: 0, eliminations: 0, appearance: 'frog', teleports: [] }],
    mutantZone: { id: 'zone-old', remainingMs: 180000 },
    mutantZoneInitialized: true,
    sharedMusicUrl: '',
    aiDialogue: null,
    aiHistory: [],
    eliminationRecords: [{ id: 'p1', eliminations: 1, name: 'Stanley' }]
  };
  const changed = {
    pieces: [{
      id: 'p1', r: 0, c: 1, eliminations: 2, appearance: 'dragon',
      description: 'Public profile', voiceLines: { victory: 'We won' },
      personality: 'Calm strategist', language: 'pt-BR', aiVoice: 'nova',
      moves: [[0, 0]], teleports: [[0, 0]]
    }],
    mutantZone: { id: 'zone-new', remainingMs: 179000 },
    sharedMusicUrl: 'https://example.test/arena.mp3',
    aiDialogue: {
      id: 'dialogue-1', createdAt: 1700000000000,
      lines: [{ pieceId: 'p1', text: 'Ready.' }]
    },
    aiHistory: [{
      id: 'dialogue-1:0', pieceId: 'p1', name: 'Stanley',
      side: 0, kind: 'exchange', text: 'Ready.', createdAt: 1700000000000
    }],
    xpOrbs: [],
    eliminationRecords: [{ id: 'p1', eliminations: 2, name: 'Stanley' }]
  };
  const current = {
    ...base,
    mutantZone: { id: 'zone-current', remainingMs: 178000 },
    eliminationRecords: [{ id: 'p1', eliminations: 3, name: 'Stanley' }]
  };
  const merged = mergeFreezoneRoomState(base, changed, current);
  assert.deepEqual(merged.pieces[0], changed.pieces[0]);
  assert.equal(merged.pieces[0].appearance, 'dragon');
  assert.equal(merged.pieces[0].personality, 'Calm strategist');
  assert.deepEqual(merged.pieces[0].teleports, [[0, 0]]);
  assert.equal(merged.pieces[0].eliminations, 2);
  assert.equal(merged.eliminationRecords[0].eliminations, 3);
  assert.equal(merged.mutantZone.id, 'zone-new');
  assert.equal(merged.sharedMusicUrl, 'https://example.test/arena.mp3');
  assert.deepEqual(merged.aiDialogue, changed.aiDialogue);
  assert.equal(merged.aiHistory.length, 1);
  assert.equal(merged.aiHistory[0].text, 'Ready.');
  assert.equal(sanitizeFreezoneAIHistory([{
    id: 'bad', pieceId: 'p1', text: 'x'.repeat(140), createdAt: 1
  }])[0].text.length, 120);
});

test('Freezone AI can only choose a legal candidate and optional speech respects local voice settings', () => {
  const candidate = {
    id: freezoneAICandidateId('piece-1', { r: 4, c: 4 }, { r: 3, c: 4 }, 'drag'),
    pieceId: 'piece-1',
    from: { r: 4, c: 4 },
    to: { r: 3, c: 4 },
    kind: 'drag',
    stepCost: 1
  };
  const decision = normalizeFreezoneAIDecision({
    moveId: candidate.id,
    lines: [
      { pieceId: 'piece-1', text: `  ${'a'.repeat(140)}  ` },
      { pieceId: 'enemy-piece', text: 'Not an allowed speaker.' }
    ]
  }, [candidate], ['piece-1']);
  assert.equal(decision.ok, true);
  assert.deepEqual(decision.candidate, candidate);
  assert.equal(decision.lines.length, 1);
  assert.equal(decision.lines[0].text.length, 120);
  assert.equal(normalizeFreezoneAIDecision({ moveId: 'invented' }, [candidate], ['piece-1']).ok, false);
  const oneSpeakerOnly = normalizeFreezoneAIDecision({
    moveId: candidate.id,
    lines: [
      { pieceId: 'piece-1', text: 'First line.' },
      { pieceId: 'piece-1', text: 'Second line.' }
    ]
  }, [candidate], ['piece-1']);
  assert.equal(oneSpeakerOnly.lines.length, 1);
  assert.equal(shouldRequestFreezoneAIVoice(false, 'Hello', 'alloy'), false);
  assert.equal(shouldRequestFreezoneAIVoice(true, 'Hello', 'unavailable'), false);
  assert.equal(shouldRequestFreezoneAIVoice(true, '   ', 'alloy'), false);
  assert.equal(shouldRequestFreezoneAIVoice(true, 'Hello', 'alloy'), true);
  assert.equal(shouldRequestFreezoneAIVoice(true, 'Hello', 'Kore', 'gemini-live'), true);

  const dialogue = sanitizeFreezoneAIDialogue({
    id: 'dialogue-2',
    createdAt: 1700000000000,
    lines: [
      { pieceId: 'piece-1', text: 'First line' },
      { pieceId: 'piece-2', text: 'Second line' },
      { pieceId: 'piece-3', text: 'Third line' }
    ]
  });
  assert.equal(dialogue.lines.length, 2);
  const staleSave = mergeFreezoneRoomState(
    { aiDialogue: null },
    { aiDialogue: null },
    { aiDialogue: dialogue }
  );
  assert.equal(staleSave.aiDialogue.id, 'dialogue-2');
});

test('Concurrent Freezone pickup claims award an orb to only one side after room merge', () => {
  const base = {
    pieces: [],
    xpOrbs: [{ id: 'orb-one', r: 4, c: 4, type: 'xp' }],
    orbClaims: [],
    freezonePlayers: {
      0: { xp: 0, orbBalances: { xp: 0 } },
      1: { xp: 0, orbBalances: { xp: 0 } }
    }
  };
  const local = {
    ...base,
    xpOrbs: [],
    orbClaims: [{ orbId: 'orb-one', side: 0, type: 'xp', amount: 1 }],
    freezonePlayers: {
      0: { xp: 1, orbBalances: { xp: 1 } },
      1: { xp: 0, orbBalances: { xp: 0 } }
    }
  };
  const current = {
    ...base,
    xpOrbs: [],
    orbClaims: [{ orbId: 'orb-one', side: 1, type: 'xp', amount: 1 }],
    freezonePlayers: {
      0: { xp: 0, orbBalances: { xp: 0 } },
      1: { xp: 1, orbBalances: { xp: 1 } }
    }
  };
  const merged = mergeFreezoneRoomState(base, local, current);
  assert.equal(merged.freezonePlayers[0].xp + merged.freezonePlayers[1].xp, 1);
  assert.deepEqual(merged.orbClaims, current.orbClaims);
  assert.equal(merged.xpOrbs.length, 0);
});

test('Freezone eliminations increment once and retain ties for the leaders display', () => {
  const first = { freeEliminations: 0 };
  const second = { freeEliminations: 1 };
  assert.equal(incrementFreezoneEliminations(first), 1);
  assert.equal(incrementFreezoneEliminations(first), 2);
  assert.equal(incrementFreezoneEliminations(second), 2);
  assert.deepEqual(getFreezoneEliminationLeaders([
    { id: 'a', name: 'A', eliminations: first.freeEliminations },
    { id: 'b', name: 'B', eliminations: second.freeEliminations }
  ]), {
    count: 2,
    leaders: [
      { id: 'a', name: 'A', eliminations: 2 },
      { id: 'b', name: 'B', eliminations: 2 }
    ]
  });
});

test('Freezone speech remains silent when disabled or when a selected voice is missing', () => {
  const voices = [{ voiceURI: 'available', name: 'Available voice' }];
  assert.equal(resolveFreezoneVoice(voices, 'missing'), null);
  assert.equal(shouldSpeakFreezoneVoice(false, 'Hello', true), false);
  assert.equal(shouldSpeakFreezoneVoice(true, 'Hello', false), false);
  assert.equal(shouldSpeakFreezoneVoice(true, '', true), false);
  assert.equal(shouldSpeakFreezoneVoice(true, 'Hello', true), true);
});

test('Freezone drag, jump, teleport and envelope step budgets are evaluated independently', () => {
  assert.equal(FREEZONE_BOARD_SIZE, 64);
  assert.equal(canUpgradeFreezoneEnvelope(2, 2, 2, 3), true);
  assert.equal(canUpgradeFreezoneEnvelope(3, 3, 2, 4), false);

  const piece = { id: 'mover', side: 0, r: 10, c: 10, moves: [[0, 3], [2, 1], [3, -2], [0, 0]], jumps: [[2, 1]], teleports: [[3, -2], [0, 0]], slide: true };
  const drag = computeFreezoneMoves(piece, {
    envelopeRows: 3, envelopeCols: 3, stepsRemaining: 2, pieces: [piece]
  });
  assert.deepEqual(drag.filter((move) => move.kind === 'drag').map((move) => move.stepCost), [1, 2]);
  assert.deepEqual(drag.find((move) => move.kind === 'jump').path, [
    { r: 11, c: 10 }, { r: 12, c: 11 }
  ]);
  assert.equal(drag.find((move) => move.kind === 'teleport').path.length, 0);
  assert.equal(drag.some((move) => move.kind === 'teleport' && move.r === 10 && move.c === 10), true);

  const blockedJump = computeFreezoneMoves(piece, {
    envelopeRows: 3,
    envelopeCols: 3,
    stepsRemaining: 2,
    pieces: [piece, { id: 'blocker', side: 1, r: 11, c: 10 }]
  });
  assert.equal(blockedJump.some((move) => move.kind === 'jump'), false);
  assert.equal(blockedJump.some((move) => move.kind === 'teleport'), true);
});

test('Freezone mutant zone uses synchronized duration and expires without a replacement', () => {
  const zone = createFreezoneMutantZone(FREEZONE_BOARD_SIZE, () => 0);
  const nextMatchZone = createFreezoneMutantZone(FREEZONE_BOARD_SIZE, () => 0.2);
  assert.equal(zone.shape, 'diamond');
  assert.notEqual(zone.id, nextMatchZone.id);
  assert.equal(zone.remainingMs, FREEZONE_MUTANT_DURATION_MS);
  assert.equal(zone.active, true);
  const expired = advanceFreezoneMutantZone(zone, FREEZONE_MUTANT_DURATION_MS);
  assert.equal(expired.active, false);
  assert.equal(normalizeFreezoneMutantZone(expired), null);
});

test('Freezone orb population is spread across the larger map without occupying pieces', () => {
  let seed = 41;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const occupied = ['0,0', '31,31', '63,63'];
  const orbs = generateFreezoneOrbPositions(FREEZONE_BOARD_SIZE, occupied, FREEZONE_ORB_TARGET_COUNT, random);
  const cells = new Set(orbs.map(({ r, c }) => `${r},${c}`));
  assert.equal(orbs.length, 512);
  assert.equal(cells.size, orbs.length);
  assert.equal(orbs.some(({ r, c }) => occupied.includes(`${r},${c}`)), false);
  assert.ok(orbs.some(({ r, c }) => r < 32 && c < 32));
  assert.ok(orbs.some(({ r, c }) => r >= 32 && c >= 32));
});

test('Freezone shared audio accepts HTTP URLs and bounded MP3 files only', () => {
  assert.equal(validateFreezoneAudioUrl('https://example.test/music.mp3').ok, true);
  assert.equal(validateFreezoneAudioUrl('javascript:alert(1)').ok, false);
  assert.equal(validateFreezoneAudioUrl('https://user:password@example.test/music.mp3').ok, false);
  assert.equal(validateFreezoneAudioFile({ name: 'music.mp3', type: 'audio/mpeg', size: 1024 }).ok, true);
  assert.equal(validateFreezoneAudioFile({ name: 'movie.mp3', type: 'video/mp4', size: 1024 }).ok, false);
  assert.equal(validateFreezoneAudioFile({ name: 'large.mp3', type: 'audio/mpeg', size: 21 * 1024 * 1024 }).ok, false);
});

test('Freezone capture animation has approach, strike and advance phases', () => {
  assert.equal(freezoneCapturePhase(0.1), 'approach');
  assert.equal(freezoneCapturePhase(0.4), 'strike');
  assert.equal(freezoneCapturePhase(0.8), 'advance');
  assert.equal(freezoneCapturePhase(1), 'complete');
});

test('Freezone camera keeps a comfortable distance when re-framing a moved piece', () => {
  const pose = freezoneFocusPose([0, 5, 10], [0, 0, 0], [8, 0.5, -4]);
  assert.deepEqual(pose.target, [8, 0.5, -4]);
  const distance = Math.hypot(
    pose.position[0] - pose.target[0],
    pose.position[1] - pose.target[1],
    pose.position[2] - pose.target[2]
  );
  assert.ok(distance >= 9.5);
  assert.ok(pose.position[1] - pose.target[1] >= 2.8);
  assert.ok(pose.position.every(Number.isFinite));
});

test('Freezone shop stays open through repeated HUD updates', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'src/FreezonePanel.tsx'), 'utf-8');
  const handlerStart = panel.indexOf('const handleFreezoneState =');
  const handlerEnd = panel.indexOf('const handleOpenArena =', handlerStart);
  const handler = panel.slice(handlerStart, handlerEnd);

  assert.ok(handler.includes('activeFreezoneHudRef.current'));
  assert.ok(handler.includes('if (enabled !== wasEnabled) setOpen(false)'));
  assert.ok(!handler.includes('if (detail?.enabled) setOpen(false)'));
});

test('Freezone selection persists for repeat moves and camera reframes only after a move', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'src/wizardChessEngine.js'), 'utf-8');
  const selectionStart = engine.indexOf('selectedFreePieceId = hitPiece.freeId;', engine.indexOf('function handleCustomModeClick'));
  const selectionEnd = engine.indexOf('if (!hitSquare)', selectionStart);
  const selection = engine.slice(selectionStart, selectionEnd);

  assert.ok(selection.includes('showSquareHighlights(hitPiece.r, hitPiece.c, customMovesForPiece(hitPiece))'));
  assert.ok(!selection.includes('focusFreezonePiece(hitPiece)'));
  assert.match(engine, /showSquareHighlights\(\s*focusPiece\.r,/);
  assert.ok(engine.includes('focusFreezonePiece(focusPiece);'));
  assert.ok(engine.includes('player.controlledPieceId'));
  assert.ok(engine.includes('requestFreezoneAIMove'));
  assert.ok(engine.includes('handleCustomModeClick(\n          { clientX: -1, clientY: -1 }'));
  assert.ok(engine.includes("if (selectedPiece && customGameConfig.gameMode !== 'freezone')"));
  const canMoveStart = engine.indexOf('function canMoveFreezonePiece');
  const canMoveEnd = engine.indexOf('function recordFreezoneMove', canMoveStart);
  assert.ok(!engine.slice(canMoveStart, canMoveEnd).includes('movedPieceIds.includes'));
  assert.ok(engine.includes('Spend one to gain one more move action per cycle'));
});
