const TEXT_PROVIDERS = new Set(['gemini', 'openai', 'deepseek']);
const VOICE_PROVIDERS = new Set([
  'gemini-live',
  'gemini-tts',
  'openai-tts',
  'google-tts'
]);
const API_KEY_PROVIDERS = new Set(['gemini', 'openai', 'deepseek', 'google']);

const settings = {
  textProvider: 'gemini',
  voiceProvider: 'gemini-live',
  apiKeys: {
    gemini: '',
    openai: '',
    deepseek: '',
    google: ''
  }
};

function boundedSecret(value) {
  return typeof value === 'string' ? value.trim().slice(0, 512) : '';
}

export function updateFreezoneAISettings(update = {}) {
  if (TEXT_PROVIDERS.has(update.textProvider)) {
    settings.textProvider = update.textProvider;
  }
  if (VOICE_PROVIDERS.has(update.voiceProvider)) {
    settings.voiceProvider = update.voiceProvider;
  }
  if (update.apiKeys && typeof update.apiKeys === 'object') {
    for (const [provider, key] of Object.entries(update.apiKeys)) {
      if (API_KEY_PROVIDERS.has(provider)) {
        settings.apiKeys[provider] = boundedSecret(key);
      }
    }
  }
}

export function clearFreezoneAIKeys() {
  for (const provider of API_KEY_PROVIDERS) settings.apiKeys[provider] = '';
}

export function getFreezoneAIRequestSettings() {
  return {
    textProvider: settings.textProvider,
    textApiKey: settings.apiKeys[settings.textProvider] || '',
    voiceProvider: settings.voiceProvider,
    voiceApiKey: settings.voiceProvider === 'google-tts'
      ? settings.apiKeys.google || ''
      : settings.voiceProvider === 'openai-tts'
        ? settings.apiKeys.openai || ''
        : settings.apiKeys.gemini || '',
    liveVoice: settings.liveVoice
  };
}

export function getFreezoneAISettings() {
  return {
    textProvider: settings.textProvider,
    voiceProvider: settings.voiceProvider,
    apiKeys: { ...settings.apiKeys }
  };
}

export function getFreezoneAIKeyPresence() {
  return Object.fromEntries(
    Array.from(API_KEY_PROVIDERS, (provider) => [
      provider,
      Boolean(settings.apiKeys[provider])
    ])
  );
}
