/// <reference lib="WebWorker" />

import {
  runtimeError,
  runtimeProtocol,
  type RuntimeBootGateProblem,
  type RuntimeBootGateShutdown,
  type RuntimeHello,
  type RuntimeHelloAck,
} from '@patchpit/system/runtime/protocol';
import { patchpitRuntimeBuildId } from './build-id';

const runtimeInstanceId = crypto.randomUUID();
const ports = new Set<MessagePort>();
const workerScope = self as unknown as SharedWorkerGlobalScope;

workerScope.addEventListener('connect', (event) => {
  const port = event.ports[0];
  if (port === undefined) return;

  ports.add(port);
  port.addEventListener('message', (message) => {
    handlePortMessage(port, message.data);
  });
  port.start();
});

function handlePortMessage(port: MessagePort, message: unknown): void {
  if (isRuntimeHello(message)) {
    if (message.buildId !== patchpitRuntimeBuildId) {
      postProblem(port, runtimeError(
        'runtime_unavailable',
        'Runtime boot gate build does not match the page build.',
        'stale-build',
      ));
      closeWorkerSoon();
      return;
    }

    const ack: RuntimeHelloAck = {
      protocol: runtimeProtocol,
      type: 'helloAck',
      buildId: patchpitRuntimeBuildId,
      clientId: message.clientId,
      runtimeInstanceId,
      workspaceId: message.workspaceId,
    };
    port.postMessage(ack);
    return;
  }

  if (isRuntimeBootGateShutdown(message)) {
    ports.delete(port);
    port.close();
    if (message.reason === 'stale-build' || message.reason === 'dev-reload') closeWorkerSoon();
  }
}

function closeWorkerSoon(): void {
  setTimeout(() => {
    for (const port of ports) port.close();
    ports.clear();
    workerScope.close();
  }, 0);
}

function postProblem(port: MessagePort, error: RuntimeBootGateProblem['error']): void {
  const problem: RuntimeBootGateProblem = { protocol: runtimeProtocol, type: 'problem', error };
  port.postMessage(problem);
}

function isRuntimeHello(message: unknown): message is RuntimeHello {
  return isRecord(message)
    && message.protocol === runtimeProtocol
    && message.type === 'hello'
    && typeof message.buildId === 'string'
    && typeof message.clientId === 'string'
    && (
      message.clientKind === 'agent'
      || message.clientKind === 'device-adapter'
      || message.clientKind === 'sandbox'
      || message.clientKind === 'tab'
    )
    && typeof message.workspaceId === 'string';
}

function isRuntimeBootGateShutdown(message: unknown): message is RuntimeBootGateShutdown {
  return isRecord(message)
    && message.protocol === runtimeProtocol
    && message.type === 'shutdown'
    && (
      message.reason === 'client-close'
      || message.reason === 'dev-reload'
      || message.reason === 'stale-build'
    );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
