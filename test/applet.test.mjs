import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  FREEZONE_APPEARANCES,
  getFreezoneEliminationLeaders,
  incrementFreezoneEliminations,
  mergeFreezoneRoomState,
  resolveFreezoneVoice,
  sanitizeFreezoneProfile,
  shouldSpeakFreezoneVoice
} from '../src/freezoneCustomization.js';

const ROOT = process.cwd();

test('Simplified Single-Player HUD in src/App.tsx excludes speed sliders, notation script bar, and multiplayer lobby', () => {
  const appTsx = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf-8');

  // Must include simplified game & camera controls
  for (const requiredId of [
    'btn-side-toggle',
    'btn-ai-move',
    'btn-reset',
    'btn-cam-player',
    'btn-cam-top',
    'btn-cam-side',
    'btn-cam-wide',
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
    voiceLines: { inspection: '  Welcome  ', unknown: 'ignored' }
  });
  assert.equal(profile.appearance, 'dragon');
  assert.equal(profile.name, 'Stanley');
  assert.equal(profile.description.length, 160);
  assert.equal(profile.voiceLines.inspection, 'Welcome');
  assert.equal(profile.voiceLines.victory, '');
  assert.equal(sanitizeFreezoneProfile({ appearance: 'external-model' }).appearance, '');
});

test('Freezone room merge preserves synced profile and elimination fields', () => {
  const base = {
    pieces: [{ id: 'p1', r: 0, c: 0, eliminations: 0, appearance: 'frog' }],
    eliminationRecords: [{ id: 'p1', eliminations: 1, name: 'Stanley' }]
  };
  const changed = {
    pieces: [{
      id: 'p1', r: 0, c: 1, eliminations: 2, appearance: 'dragon',
      description: 'Public profile', voiceLines: { victory: 'We won' }
    }],
    xpOrbs: [],
    eliminationRecords: [{ id: 'p1', eliminations: 2, name: 'Stanley' }]
  };
  const current = {
    ...base,
    eliminationRecords: [{ id: 'p1', eliminations: 3, name: 'Stanley' }]
  };
  const merged = mergeFreezoneRoomState(base, changed, current);
  assert.deepEqual(merged.pieces[0], changed.pieces[0]);
  assert.equal(merged.pieces[0].appearance, 'dragon');
  assert.equal(merged.pieces[0].eliminations, 2);
  assert.equal(merged.eliminationRecords[0].eliminations, 3);
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
