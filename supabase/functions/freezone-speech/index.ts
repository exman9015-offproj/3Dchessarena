import {
  authorizeFreezonePlayer,
  corsHeaders,
  errorResponse,
  FreezoneFunctionError,
  limitedText,
  readJsonBody
} from '../_shared/freezone.ts';

const openAIVoices = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer'
]);
const geminiVoiceByCharacter: Record<string, string> = {
  alloy: 'Kore',
  ash: 'Fenrir',
  ballad: 'Puck',
  coral: 'Aoede',
  echo: 'Charon',
  fable: 'Puck',
  onyx: 'Charon',
  nova: 'Aoede',
  sage: 'Kore',
  shimmer: 'Aoede'
};
const voiceEvents = new Set([
  'entry', 'move', 'capture', 'death', 'allyDeath', 'purchase', 'upgrade',
  'inactivity', 'inspection', 'victory', 'defeat', 'vulnerable'
]);
const requestTimes = new Map<string, number>();

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toWav(pcm: Uint8Array, sampleRate = 24000) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header));
  wav.set(pcm, 44);
  return wav;
}

function generateGeminiLiveSpeech(
  apiKey: string,
  text: string,
  voice: string,
  language: string,
  personality: string
) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;
    const socket = new WebSocket(url);
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let outputMimeType = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        socket.close();
      } catch {
        // The socket may already be closed by the provider.
      }
      if (error) {
        reject(error);
        return;
      }
      if (!chunks.length) {
        reject(new FreezoneFunctionError('Gemini Live returned no audio.', 502));
        return;
      }
      const audio = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        audio.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(outputMimeType.includes('wav') ? audio : toWav(audio));
    };
    const timeout = setTimeout(
      () => finish(new FreezoneFunctionError('Gemini Live voice timed out.', 504)),
      25000
    );

    socket.onopen = () => {
      socket.send(JSON.stringify({
        setup: {
          model: 'models/gemini-3.8-live',
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
            }
          },
          systemInstruction: {
            parts: [{
              text: [
                `Speak in ${language}.`,
                personality ? `Character style: ${personality}.` : '',
                'Say the supplied character line faithfully, with natural emotion, and do not add a greeting or extra dialogue.'
              ].filter(Boolean).join(' ')
            }]
          }
        }
      }));
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        finish(new FreezoneFunctionError('Gemini Live returned an unreadable message.', 502));
        return;
      }
      let message: {
        setupComplete?: unknown;
        error?: { message?: unknown };
        serverContent?: {
          modelTurn?: { parts?: Array<{ inlineData?: { data?: unknown; mimeType?: unknown } }> };
          turnComplete?: unknown;
        };
      };
      try {
        message = JSON.parse(event.data);
      } catch {
        finish(new FreezoneFunctionError('Gemini Live returned invalid data.', 502));
        return;
      }
      if (message.error) {
        finish(new FreezoneFunctionError('Gemini Live could not generate this voice.', 502));
        return;
      }
      if (message.setupComplete) {
        socket.send(JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true
          }
        }));
      }
      for (const part of message.serverContent?.modelTurn?.parts || []) {
        const data = part.inlineData?.data;
        if (typeof data !== 'string') continue;
        const bytes = decodeBase64(data);
        totalBytes += bytes.length;
        if (totalBytes > 4 * 1024 * 1024) {
          finish(new FreezoneFunctionError('Gemini Live audio exceeded the size limit.', 502));
          return;
        }
        outputMimeType = typeof part.inlineData?.mimeType === 'string'
          ? part.inlineData.mimeType.toLowerCase()
          : outputMimeType;
        chunks.push(bytes);
      }
      if (message.serverContent?.turnComplete) finish();
    };
    socket.onerror = () => {
      finish(new FreezoneFunctionError('Could not connect to Gemini Live.', 502));
    };
    socket.onclose = () => {
      if (!settled) finish(new FreezoneFunctionError('Gemini Live closed before finishing the voice.', 502));
    };
  });
}

function audioResponse(audio: Uint8Array, contentType: string) {
  if (!audio.byteLength || audio.byteLength > 4 * 1024 * 1024) {
    throw new FreezoneFunctionError('Generated character audio was empty or too large.', 502);
  }
  const body = new ArrayBuffer(audio.byteLength);
  new Uint8Array(body).set(audio);
  return new Response(body, {
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'Content-Length': String(audio.byteLength)
    }
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST is required.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await readJsonBody(request, 16 * 1024);
    const { roomCode, playerToken, state } = await authorizeFreezonePlayer(body);
    const dialogueId = limitedText(body.dialogueId, 128);
    const pieceId = limitedText(body.pieceId, 256);
    const text = limitedText(body.text, 120);
    if (!pieceId || !text) {
      throw new FreezoneFunctionError('A piece and non-empty speech line are required.');
    }
    const piece = Array.isArray(state.pieces)
      ? state.pieces.find((candidate) => candidate?.id === pieceId)
      : null;
    if (!piece) throw new FreezoneFunctionError('Character profile was not found.', 404);
    const event = limitedText(body.event, 24);
    const validDialogue = Boolean(
      state.aiDialogue &&
      state.aiDialogue.id === dialogueId &&
      Array.isArray(state.aiDialogue.lines) &&
      state.aiDialogue.lines.some((line) => line?.pieceId === pieceId && line?.text === text)
    );
    const profileLine = piece.voiceLines?.[event] ?? piece.freeVoiceLines?.[event];
    const validEventLine = Boolean(
      voiceEvents.has(event) && typeof profileLine === 'string' && profileLine === text
    );
    if (!validDialogue && !validEventLine) {
      throw new FreezoneFunctionError('This line is not present in the synchronized room state.', 409);
    }

    const provider = typeof body.provider === 'string' ? body.provider : 'gemini-live';
    if (!['gemini-live', 'gemini-tts', 'openai-tts', 'google-tts'].includes(provider)) {
      throw new FreezoneFunctionError('Choose Gemini Live, Gemini TTS, OpenAI TTS, or Google Cloud TTS.');
    }
    const keySetting = provider === 'openai-tts' ? 'OPENAI_API_KEY'
      : provider === 'google-tts' ? 'GOOGLE_TTS_API_KEY'
        : 'GEMINI_API_KEY';
    const apiKey = limitedText(body.apiKey, 512) || Deno.env.get(keySetting);
    if (!apiKey) {
      throw new FreezoneFunctionError(`Add a ${provider} API key in Freezone settings or configure it on the server.`, 503);
    }
    const rateKey = `${roomCode}:${playerToken}:${pieceId}`;
    const now = Date.now();
    if (now - (requestTimes.get(rateKey) || 0) < 1500) {
      throw new FreezoneFunctionError('Please wait before requesting another character voice.', 429);
    }
    requestTimes.set(rateKey, now);

    const language = limitedText(piece.language, 16) || 'en-US';
    const personality = limitedText(piece.personality, 160);
    const voice = limitedText(piece.aiVoice, 32);
    const geminiVoice = geminiVoiceByCharacter[voice] || 'Kore';
    if (provider === 'gemini-live') {
      return audioResponse(
        await generateGeminiLiveSpeech(apiKey, text, geminiVoice, language, personality),
        'audio/wav'
      );
    }

    if (provider === 'gemini-tts') {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash-tts',
          input: [{
            type: 'user_input',
            content: [{
              type: 'text',
              text,
              annotations: [{
                type: 'speech_metadata',
                style: personality ? `${language}; ${personality}` : language
              }]
            }]
          }],
          response_format: { type: 'audio' },
          generation_config: {
            speech_config: [{ voice: geminiVoice }]
          }
        })
      });
      if (!response.ok) {
        throw new FreezoneFunctionError(`Gemini TTS request failed (${response.status}).`, 502);
      }
      const result = await response.json();
      const base64Audio = result?.output_audio?.data ||
        result?.steps?.flatMap((step: { content?: Array<{ type?: string; data?: string }> }) =>
          step?.content || []).find((part: { type?: string; data?: string }) =>
          part?.type === 'audio' && typeof part.data === 'string')?.data;
      if (typeof base64Audio !== 'string') {
        throw new FreezoneFunctionError('Gemini TTS returned no audio.', 502);
      }
      return audioResponse(decodeBase64(base64Audio), 'audio/wav');
    }

    if (provider === 'google-tts') {
      const languageCode = /^[a-z]{2}-[A-Z]{2}$/.test(language) ? language : 'en-US';
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode,
              name: `${languageCode}-Neural2-A`
            },
            audioConfig: { audioEncoding: 'MP3' }
          })
        }
      );
      if (!response.ok) {
        throw new FreezoneFunctionError(`Google Cloud TTS request failed (${response.status}).`, 502);
      }
      const result = await response.json();
      if (typeof result?.audioContent !== 'string') {
        throw new FreezoneFunctionError('Google Cloud TTS returned no audio.', 502);
      }
      return audioResponse(decodeBase64(result.audioContent), 'audio/mpeg');
    }

    if (!openAIVoices.has(voice)) {
      throw new FreezoneFunctionError('This piece does not have a supported OpenAI voice.', 400);
    }
    const instructions = [
      `Speak in ${language}.`,
      personality ? `Character style: ${personality}.` : ''
    ].filter(Boolean).join(' ');
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: text,
        instructions,
        response_format: 'mp3'
      })
    });
    if (!response.ok) {
      throw new FreezoneFunctionError(`OpenAI TTS request failed (${response.status}).`, 502);
    }
    return audioResponse(new Uint8Array(await response.arrayBuffer()), 'audio/mpeg');
  } catch (error) {
    const response = errorResponse(error);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
});
