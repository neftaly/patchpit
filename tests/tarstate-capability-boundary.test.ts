import { describe, expect, it } from 'vitest';

type OpaqueResourceId = string & { readonly __resourceId: unique symbol };

type AdapterOnlyRenderer = {
  readonly document: { readonly fullscreenElement: unknown };
  readonly navigator: { readonly userAgent: string };
  readonly store: Map<string, unknown>;
  readonly window: { readonly innerWidth: number };
};

type AppEffectIntent = {
  readonly intentId: string;
  readonly kind: 'fullscreen.request' | 'renderer.status.read';
  readonly resourceId: OpaqueResourceId;
};

type AppEffectResult = {
  readonly code: string;
  readonly intentId: string;
  readonly ok: boolean;
};

type AppDiagnostic = {
  readonly code: string;
  readonly targetId: OpaqueResourceId;
};

const forbiddenBoundaryKeys = ['document', 'navigator', 'renderer', 'store', 'window'] as const;

describe('tarstate capability boundary', () => {
  it('keeps raw browser-ish handles adapter-only and emits only opaque ids/results/diagnostics', () => {
    const adapter = new FakeAdapter();
    const resourceId = adapter.registerRenderer({
      document: { fullscreenElement: null },
      navigator: { userAgent: 'node-test' },
      store: new Map([['secret', 'adapter-only']]),
      window: { innerWidth: 1280 }
    });

    const intent: AppEffectIntent = {
      intentId: 'intent-1',
      kind: 'fullscreen.request',
      resourceId
    };
    const result = adapter.apply(intent);
    const deniedResult = adapter.apply({
      intentId: 'intent-2',
      kind: 'renderer.status.read',
      resourceId: 'resource-missing' as OpaqueResourceId
    });
    const diagnostic = adapter.diagnostics()[0];

    expectForbiddenBoundaryKeysAbsent(serializedBoundaryValue(intent));
    expectForbiddenBoundaryKeysAbsent(serializedBoundaryValue(result));
    expectForbiddenBoundaryKeysAbsent(serializedBoundaryValue(deniedResult));
    expectForbiddenBoundaryKeysAbsent(serializedBoundaryValue(diagnostic));
    expect(result).toEqual({ code: 'ok', intentId: 'intent-1', ok: true });
    expect(deniedResult).toEqual({ code: 'resource_missing', intentId: 'intent-2', ok: false });
  });

  it('documents the app-side rule as serializable tarstate relations plus effect intents only', () => {
    const allowedAppBoundaryNouns = [
      'opaque resource id',
      'effect intent',
      'effect result',
      'runtime diagnostic',
      'tarstate relation row'
    ];

    expect(allowedAppBoundaryNouns).not.toContain('window');
    expect(allowedAppBoundaryNouns).not.toContain('document');
    expect(allowedAppBoundaryNouns).not.toContain('navigator');
    expect(allowedAppBoundaryNouns).not.toContain('store');
    expect(allowedAppBoundaryNouns).not.toContain('renderer handle');
  });
});

class FakeAdapter {
  private nextId = 0;
  private readonly diagnosticsLog: AppDiagnostic[] = [];
  private readonly renderers = new Map<OpaqueResourceId, AdapterOnlyRenderer>();

  registerRenderer(renderer: AdapterOnlyRenderer): OpaqueResourceId {
    const id = `resource-${this.nextId}` as OpaqueResourceId;
    this.nextId += 1;
    this.renderers.set(id, renderer);
    return id;
  }

  apply(intent: AppEffectIntent): AppEffectResult {
    if (!this.renderers.has(intent.resourceId)) {
      this.diagnosticsLog.push({ code: 'resource_missing', targetId: intent.resourceId });
      return { code: 'resource_missing', intentId: intent.intentId, ok: false };
    }

    return { code: 'ok', intentId: intent.intentId, ok: true };
  }

  diagnostics(): readonly AppDiagnostic[] {
    return this.diagnosticsLog;
  }
}

function serializedBoundaryValue(value: unknown): string {
  return JSON.stringify(value);
}

function expectForbiddenBoundaryKeysAbsent(value: string): void {
  for (const key of forbiddenBoundaryKeys) {
    expect(value).not.toContain(`"${key}"`);
  }
}
