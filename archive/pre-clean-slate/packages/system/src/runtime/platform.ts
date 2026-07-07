export type RuntimePlatformFeature =
  | 'cacheApi'
  | 'cryptoRandomUUID'
  | 'dedicatedWorker'
  | 'indexedDb'
  | 'messageChannel'
  | 'secureContext'
  | 'serviceWorker'
  | 'sharedWorker'
  | 'structuredClone'
  | 'transferableArrayBuffer'
  | 'webSocket';

export type RuntimePlatformReport = {
  readonly ok: boolean;
  readonly features: Readonly<Record<RuntimePlatformFeature, boolean>>;
  readonly missing: readonly RuntimePlatformFeature[];
  readonly plannedMissing: readonly RuntimePlatformFeature[];
};

export const requiredRuntimeBootFeatures = [
  'cryptoRandomUUID',
  'secureContext',
  'sharedWorker',
] as const satisfies readonly RuntimePlatformFeature[];

export const plannedSharedRuntimePlatformFeatures = [
  'cacheApi',
  'dedicatedWorker',
  'indexedDb',
  'messageChannel',
  'serviceWorker',
  'structuredClone',
  'transferableArrayBuffer',
  'webSocket',
] as const satisfies readonly RuntimePlatformFeature[];

export const runtimePlatformFeatureLabels = {
  cacheApi: 'Cache API',
  cryptoRandomUUID: 'crypto.randomUUID()',
  dedicatedWorker: 'Dedicated Worker',
  indexedDb: 'IndexedDB',
  messageChannel: 'MessageChannel',
  secureContext: 'secure context',
  serviceWorker: 'Service Worker',
  sharedWorker: 'SharedWorker',
  structuredClone: 'structuredClone()',
  transferableArrayBuffer: 'transferable ArrayBuffer',
  webSocket: 'WebSocket',
} as const satisfies Readonly<Record<RuntimePlatformFeature, string>>;

export function runtimePlatformFeatureLabel(feature: RuntimePlatformFeature): string {
  return runtimePlatformFeatureLabels[feature];
}

export function probeRuntimePlatform(): RuntimePlatformReport {
  const features = {
    cacheApi: typeof caches !== 'undefined',
    cryptoRandomUUID: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function',
    dedicatedWorker: typeof Worker === 'function',
    indexedDb: typeof indexedDB !== 'undefined',
    messageChannel: typeof MessageChannel === 'function',
    secureContext: globalThis.isSecureContext === true,
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    sharedWorker: typeof SharedWorker === 'function',
    structuredClone: typeof structuredClone === 'function',
    transferableArrayBuffer: canTransferArrayBuffer(),
    webSocket: typeof WebSocket === 'function',
  } satisfies Readonly<Record<RuntimePlatformFeature, boolean>>;
  const missing = requiredRuntimeBootFeatures.filter((feature) => !features[feature]);
  const plannedMissing = plannedSharedRuntimePlatformFeatures.filter((feature) => !features[feature]);

  return { ok: missing.length === 0, features, missing, plannedMissing };
}

function canTransferArrayBuffer(): boolean {
  if (typeof MessageChannel !== 'function') return false;

  const { port1, port2 } = new MessageChannel();
  try {
    const buffer = new ArrayBuffer(1);
    port1.postMessage(buffer, [buffer]);
    return buffer.byteLength === 0;
  } catch {
    return false;
  } finally {
    port1.close();
    port2.close();
  }
}
