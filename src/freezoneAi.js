const FREEZONE_AI_VOICE_IDS = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'
]);
const FREEZONE_SPEECH_PROVIDERS = new Set([
  'gemini-live', 'gemini-tts', 'openai-tts', 'google-tts'
]);

export function freezoneAICandidateId(pieceId, from, to, kind = 'move') {
  return JSON.stringify([pieceId, from.r, from.c, to.r, to.c, kind]);
}

export function shouldRequestFreezoneAIVoice(enabled, text, voiceId, provider = 'openai-tts') {
  return enabled === true && typeof text === 'string' && text.trim().length > 0 &&
    FREEZONE_SPEECH_PROVIDERS.has(provider) &&
    (provider !== 'openai-tts' || FREEZONE_AI_VOICE_IDS.has(voiceId));
}

export function normalizeFreezoneAIDecision(response, candidates, allowedPieceIds) {
  if (!response || typeof response !== 'object' ||
      typeof response.moveId !== 'string') {
    return { ok: false, error: 'The AI returned an invalid move.' };
  }
  const candidate = candidates.find(({ id }) => id === response.moveId);
  if (!candidate) {
    return { ok: false, error: 'The AI selected a move that is no longer legal.' };
  }
  const allowedSpeakers = new Set(allowedPieceIds);
  let lines = (Array.isArray(response.lines) ? response.lines : [])
    .slice(0, 2)
    .filter((line) => line && allowedSpeakers.has(line.pieceId) &&
      typeof line.text === 'string')
    .map((line) => ({
      pieceId: line.pieceId,
      text: line.text.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
    }))
    .filter((line) => line.text.length > 0);
  if (lines.length > 1 && lines[0].pieceId === lines[1].pieceId) {
    lines = lines.slice(0, 1);
  }
  return { ok: true, candidate, lines };
}
