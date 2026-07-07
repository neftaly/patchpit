import {
  runtimeError,
  runtimeHandshakeTimeoutMs,
  runtimeProtocol,
  type ClientKind,
  type RuntimeBuildId,
  type RuntimeBootGateProblem,
  type RuntimeBootGateShutdown,
  type RuntimeError,
  type RuntimeHello,
  type RuntimeHelloAck,
} from './protocol';

export type RuntimeBootGateConnection = {
  readonly ack: RuntimeHelloAck;
  readonly port: MessagePort;
  close(reason?: RuntimeBootGateShutdown['reason']): void;
};

export type RuntimeBootGateFactoryOptions = {
  readonly attempt: 'initial' | 'stale-build-retry';
  readonly buildId: RuntimeBuildId;
  readonly name: string;
};

export type RuntimeBootGateFactory = (options: RuntimeBootGateFactoryOptions) => SharedWorker;

export type RuntimeBootGateConnectOptions = {
  readonly buildId: RuntimeBuildId;
  readonly clientId: string;
  readonly clientKind: ClientKind;
  readonly createWorker: RuntimeBootGateFactory;
  readonly handshakeTimeoutMs?: number;
  readonly workspaceId: string;
};

export class RuntimeBootGateConnectError extends Error {
  readonly runtimeError: RuntimeError;

  constructor(error: RuntimeError) {
    super(error.message);
    this.name = 'RuntimeBootGateConnectError';
    this.runtimeError = error;
  }
}

export async function connectRuntimeBootGate(
  options: RuntimeBootGateConnectOptions,
): Promise<RuntimeBootGateConnection> {
  try {
    return await connectRuntimeBootGateOnce(options, 'initial');
  } catch (error) {
    const runtimeError = error instanceof RuntimeBootGateConnectError
      ? error.runtimeError
      : runtimeErrorFromUnknown(error);
    if (runtimeError.code !== 'runtime_unavailable' || runtimeError.reason !== 'stale-build') {
      throw error;
    }

    await nextTask();
    return connectRuntimeBootGateOnce(options, 'stale-build-retry');
  }
}

export function runtimeBootGateWorkerName({
  buildId,
}: {
  readonly buildId: RuntimeBuildId;
}): string {
  return `patchpit-runtime-boot-gate:${runtimeProtocol}:${buildId}`;
}

async function connectRuntimeBootGateOnce(
  options: RuntimeBootGateConnectOptions,
  attempt: RuntimeBootGateFactoryOptions['attempt'],
): Promise<RuntimeBootGateConnection> {
  if (typeof SharedWorker !== 'function') {
    throw new RuntimeBootGateConnectError(runtimeUnavailable(
      'The SharedWorker API is not available in this environment.',
      'shared-worker-api-unavailable',
    ));
  }

  let worker: SharedWorker;
  try {
    worker = options.createWorker({
      attempt,
      buildId: options.buildId,
      name: runtimeBootGateWorkerName({ buildId: options.buildId }),
    });
  } catch (error) {
    throw new RuntimeBootGateConnectError(runtimeUnavailable(
      'SharedWorker boot gate could not be started.',
      'shared-worker-create-failed',
      unknownErrorMetadata(error),
    ));
  }

  const port = worker.port;
  const hello: RuntimeHello = {
    protocol: runtimeProtocol,
    type: 'hello',
    buildId: options.buildId,
    clientId: options.clientId,
    clientKind: options.clientKind,
    workspaceId: options.workspaceId,
  };
  let ack: RuntimeHelloAck;

  try {
    ack = await waitForHelloAck(worker, port, hello, options.handshakeTimeoutMs ?? runtimeHandshakeTimeoutMs);

    if (ack.buildId !== options.buildId) {
      postShutdown(port, 'stale-build');
      throw new RuntimeBootGateConnectError(runtimeUnavailable(
        'Runtime boot gate build does not match the page build.',
        'stale-build',
      ));
    }
  } catch (error) {
    window.setTimeout(() => port.close(), 0);
    throw error;
  }

  return {
    ack,
    port,
    close(reason = 'client-close') {
      postShutdown(port, reason);
      window.setTimeout(() => port.close(), 0);
    },
  };
}

function waitForHelloAck(
  worker: SharedWorker,
  port: MessagePort,
  hello: RuntimeHello,
  timeoutMs: number,
): Promise<RuntimeHelloAck> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      rejectWith(runtimeUnavailable(
        'Runtime boot gate did not complete the handshake in time.',
        'handshake-timeout',
        { timeoutMs },
      ));
    }, timeoutMs);

    const onMessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (isHelloAck(message)) {
        if (message.clientId === hello.clientId && message.workspaceId === hello.workspaceId) {
          resolveWith(message);
        } else {
          rejectWith(runtimeUnavailable(
            'Runtime boot gate acknowledged a different client or workspace.',
            'handshake-mismatch',
            {
              expectedClientId: hello.clientId,
              expectedWorkspaceId: hello.workspaceId,
              receivedClientId: message.clientId,
              receivedWorkspaceId: message.workspaceId,
            },
          ));
        }
        return;
      }
      if (isRuntimeBootGateProblem(message)) {
        rejectWith(message.error);
        return;
      }
      if (isRecord(message) && 'protocol' in message) {
        rejectWith(runtimeUnavailable(
          'Runtime boot gate sent an unexpected handshake message.',
          'handshake-protocol-error',
          {
            protocol: stringMetadata(message.protocol),
            type: stringMetadata(message.type),
          },
        ));
      }
    };

    const onMessageError = (event: MessageEvent<unknown>) => {
      rejectWith(runtimeUnavailable(
        'Runtime boot gate handshake message could not be read.',
        'handshake-message-error',
        { eventType: event.type },
      ));
    };

    const onWorkerError = (event: ErrorEvent) => {
      event.preventDefault();
      rejectWith(runtimeUnavailable(
        'Runtime boot gate failed before completing the handshake.',
        'handshake-error',
        {
          colno: event.colno,
          filename: event.filename,
          lineno: event.lineno,
          message: event.message,
        },
      ));
    };

    const resolveWith = (ack: RuntimeHelloAck) => {
      cleanup();
      resolve(ack);
    };

    const rejectWith = (error: RuntimeError) => {
      cleanup();
      reject(new RuntimeBootGateConnectError(error));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      port.removeEventListener('message', onMessage);
      port.removeEventListener('messageerror', onMessageError);
      worker.removeEventListener('error', onWorkerError);
    };

    port.addEventListener('message', onMessage);
    port.addEventListener('messageerror', onMessageError);
    worker.addEventListener('error', onWorkerError);
    port.start();
    port.postMessage(hello);
  });
}

function postShutdown(port: MessagePort, reason: RuntimeBootGateShutdown['reason']): void {
  const message: RuntimeBootGateShutdown = { protocol: runtimeProtocol, type: 'shutdown', reason };
  port.postMessage(message);
}

function isHelloAck(message: unknown): message is RuntimeHelloAck {
  return isRecord(message)
    && message.protocol === runtimeProtocol
    && message.type === 'helloAck'
    && typeof message.buildId === 'string'
    && typeof message.clientId === 'string'
    && typeof message.runtimeInstanceId === 'string'
    && typeof message.workspaceId === 'string';
}

function isRuntimeBootGateProblem(message: unknown): message is RuntimeBootGateProblem {
  return isRecord(message)
    && message.protocol === runtimeProtocol
    && message.type === 'problem'
    && isRecord(message.error)
    && typeof message.error.code === 'string'
    && typeof message.error.message === 'string';
}

function runtimeErrorFromUnknown(error: unknown): RuntimeError {
  return runtimeUnavailable(
    error instanceof Error ? error.message : 'Runtime boot gate connection failed.',
    'worker-connect-error',
    unknownErrorMetadata(error),
  );
}

function runtimeUnavailable(
  message: string,
  reason: string,
  metadata?: RuntimeError['metadata'],
): RuntimeError {
  return metadata === undefined
    ? runtimeError('runtime_unavailable', message, reason)
    : { code: 'runtime_unavailable', message, reason, metadata };
}

function unknownErrorMetadata(error: unknown): RuntimeError['metadata'] {
  if (error === undefined) return undefined;
  if (error instanceof Error) {
    return {
      causeName: error.name,
      causeMessage: error.message,
    };
  }
  if (typeof error === 'string') return { causeMessage: error };
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return { causeMessage: String(error) };
  }
  return { causeType: Object.prototype.toString.call(error) };
}

function stringMetadata(value: unknown): string {
  return typeof value === 'string' ? value : Object.prototype.toString.call(value);
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
