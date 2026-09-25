/** 英文：API Key 管理（ApiKeysPanel） */

export const enSettingsApi = {
  apiKeys: {
    keyMeta: '{prefix}… · created {when}',
    lastUsed: ' · last used {when}',
    failedLoad: 'Failed to load',
    defaultKey: 'Default key',
    couldCreateKey: 'Could not create the key',
    revokeApiKey: 'Revoke API key',
    revokeCannotUndone: 'Revoke “{itemName}” ({itemKey_prefix}…)? This cannot be undone.',
    revoke: 'Revoke',
    couldRevokeKey: 'Could not revoke the key',
    useApiKeyCall: 'Use an API key to call image generation, video generation and Seedance forwarding; usage is deducted from your balance',
    keyNameEG: 'Key name, e.g. “Production”',
    working: 'Working…',
    createKey: 'Create key',
    copySaveNowCannot: 'Copy and save it now — you cannot view it again after closing:',
    copyKey: 'Copy key',
    apiKeysYet: 'No API keys yet',
    howCall: 'How to call',
    authPickOneHeader: 'Auth: pick one header',
    imageGenerationSeedream: 'Image generation (Seedream)',
    videoGenerationSeedanceFirst: 'Video generation (Seedance first-frame image-to-video)',
    seedanceForwardingMultimodalBody: 'Seedance forwarding (multimodal body)',
    queryVideoTask: 'Query a video task',
  },
} as const
