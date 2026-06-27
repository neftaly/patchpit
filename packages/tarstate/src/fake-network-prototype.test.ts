import { describe, expect, it } from 'vitest';
import {
  createFakeNetwork,
  type FakeNetworkMessage,
  type FakeNetworkTraceRow
} from './fake-network-prototype.js';

describe('fake network prototype', () => {
  it('replays seeded scheduler decisions deterministically', () => {
    const runScript = () => {
      const received: number[] = [];
      const network = createFakeNetwork<{ readonly value: number }>({
        seed: 'replay-seed',
        peers: ['a', 'b'],
        policy: {
          delay: { min: 0, max: 7 },
          reorder: true,
          duplicate: (_context, rng) => (rng.chance(0.45) ? 1 : 0),
          drop: (_context, rng) => (rng.chance(0.2) ? 'seeded drop' : false)
        }
      });

      network.onMessage('b', (message) => {
        received.push(message.payload.value);
      });

      for (let value = 0; value < 10; value += 1) {
        network.send('a', 'b', { value });
      }
      network.runUntilIdle();

      return {
        received,
        trace: serializableTrace(network.trace)
      };
    };

    expect(runScript()).toEqual(runScript());
  });

  it('converges a tiny replicated register and counter under chunking, reorder, and duplication', () => {
    const peers = ['a', 'b', 'c'] as const;
    const network = createFakeNetwork<TinyPayload>({
      seed: 'tiny-crdt',
      peers,
      policy: {
        delay: { min: 0, max: 4 },
        reorder: true,
        duplicate: 2,
        chunk: ({ message }) =>
          message.payload.kind === 'batch' ? message.payload.messages : undefined
      }
    });
    const states = Object.fromEntries(peers.map((peerId) => [peerId, emptyTinyState()])) as Record<
      TinyPeer,
      TinyState
    >;

    for (const peerId of peers) {
      network.onMessage(peerId, (message, api) => {
        mergeTinyPayload(states[peerId], message.payload);
        api.recordPeerState(peerId, visibleTinyState(states[peerId]));
      });
    }

    localCounter(network, states.a, 'a', 1);
    localCounter(network, states.b, 'b', 2);
    localRegister(network, states.a, 'a', 1, 'first');
    localRegister(network, states.c, 'c', 2, 'winner');
    network.send('b', 'a', {
      kind: 'batch',
      messages: [
        { kind: 'counter', actor: 'b', value: 2 },
        { kind: 'register', actor: 'b', clock: 1, value: 'ignored' }
      ]
    });

    network.runUntilIdle();

    expect(visibleTinyState(states.a)).toEqual({
      counter: 3,
      register: 'winner',
      registerClock: 2,
      registerActor: 'c'
    });
    expect(visibleTinyState(states.b)).toEqual(visibleTinyState(states.a));
    expect(visibleTinyState(states.c)).toEqual(visibleTinyState(states.a));
    expect(network.trace.some((row) => row.row === 'network_event' && row.event === 'chunk')).toBe(true);
    expect(network.trace.some((row) => row.row === 'network_event' && row.event === 'duplicate')).toBe(true);
  });

  it('detects and blocks malformed messages from malicious peers', () => {
    const delivered: unknown[] = [];
    const network = createFakeNetwork<unknown>({
      seed: 'malicious-peer',
      peers: ['honest', 'victim'],
      policy: {
        validate: (message) =>
          isTinyCounterMessage(message)
            ? undefined
            : {
                code: 'malformed_message',
                message: 'counter messages must include an actor and numeric value',
                detail: message.payload
              },
        malicious: ({ message }) =>
          message.from === 'honest'
            ? [
                {
                  from: 'mallory',
                  to: message.to,
                  payload: { kind: 'counter', actor: 'mallory', value: 'nan' },
                  malformed: true,
                  malicious: true
                }
              ]
            : undefined
      }
    });
    network.onMessage('victim', (message) => {
      delivered.push(message.payload);
    });

    network.send('honest', 'victim', { kind: 'counter', actor: 'honest', value: 1 });
    network.runUntilIdle();

    expect(delivered).toEqual([{ kind: 'counter', actor: 'honest', value: 1 }]);
    expect(network.trace).toContainEqual(
      expect.objectContaining({
        row: 'message_delivery',
        event: 'blocked',
        message: expect.objectContaining({ malicious: true, malformed: true })
      })
    );
    expect(network.trace).toContainEqual(
      expect.objectContaining({
        row: 'diagnostic',
        code: 'malformed_message',
        peerId: 'victim'
      })
    );
  });

  it('drops deliveries that exceed a peer backpressure window', () => {
    const delivered: number[] = [];
    const network = createFakeNetwork<{ readonly value: number }>({
      seed: 'backpressure',
      peers: ['sender', 'receiver'],
      policy: {
        delay: 10,
        backpressureWindow: 1
      }
    });
    network.onMessage('receiver', (message) => {
      delivered.push(message.payload.value);
    });

    network.send('sender', 'receiver', { value: 1 });
    network.send('sender', 'receiver', { value: 2 });
    network.send('sender', 'receiver', { value: 3 });
    network.runUntilIdle();

    expect(delivered).toEqual([1]);
    expect(
      network.trace.filter((row) => row.row === 'network_event' && row.event === 'backpressure_drop')
    ).toHaveLength(2);
    expect(network.trace).toContainEqual(
      expect.objectContaining({
        row: 'diagnostic',
        code: 'backpressure_drop',
        peerId: 'receiver'
      })
    );
  });
});

type TinyPeer = 'a' | 'b' | 'c';

type TinyPayload =
  | { readonly kind: 'counter'; readonly actor: TinyPeer; readonly value: number }
  | { readonly kind: 'register'; readonly actor: TinyPeer; readonly clock: number; readonly value: string }
  | { readonly kind: 'batch'; readonly messages: readonly TinyPayload[] };

type TinyState = {
  readonly counter: Record<TinyPeer, number>;
  register: {
    readonly actor: TinyPeer;
    readonly clock: number;
    readonly value: string;
  };
};

function emptyTinyState(): TinyState {
  return {
    counter: { a: 0, b: 0, c: 0 },
    register: { actor: 'a', clock: 0, value: '' }
  };
}

function localCounter(
  network: ReturnType<typeof createFakeNetwork<TinyPayload>>,
  state: TinyState,
  actor: TinyPeer,
  delta: number
): void {
  state.counter[actor] += delta;
  network.broadcast(actor, { kind: 'counter', actor, value: state.counter[actor] });
}

function localRegister(
  network: ReturnType<typeof createFakeNetwork<TinyPayload>>,
  state: TinyState,
  actor: TinyPeer,
  clock: number,
  value: string
): void {
  state.register = { actor, clock, value };
  network.broadcast(actor, { kind: 'register', actor, clock, value });
}

function mergeTinyPayload(state: TinyState, payload: TinyPayload): void {
  if (payload.kind === 'batch') {
    for (const message of payload.messages) {
      mergeTinyPayload(state, message);
    }
    return;
  }

  if (payload.kind === 'counter') {
    state.counter[payload.actor] = Math.max(state.counter[payload.actor], payload.value);
    return;
  }

  if (
    payload.clock > state.register.clock ||
    (payload.clock === state.register.clock && payload.actor > state.register.actor)
  ) {
    state.register = {
      actor: payload.actor,
      clock: payload.clock,
      value: payload.value
    };
  }
}

function visibleTinyState(state: TinyState): {
  readonly counter: number;
  readonly register: string;
  readonly registerClock: number;
  readonly registerActor: TinyPeer;
} {
  return {
    counter: state.counter.a + state.counter.b + state.counter.c,
    register: state.register.value,
    registerClock: state.register.clock,
    registerActor: state.register.actor
  };
}

function isTinyCounterMessage(
  message: FakeNetworkMessage<unknown>
): message is FakeNetworkMessage<{ readonly kind: 'counter'; readonly actor: string; readonly value: number }> {
  const payload = message.payload;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'kind' in payload &&
    payload.kind === 'counter' &&
    'actor' in payload &&
    typeof payload.actor === 'string' &&
    'value' in payload &&
    typeof payload.value === 'number'
  );
}

function serializableTrace(trace: readonly FakeNetworkTraceRow<unknown>[]): readonly FakeNetworkTraceRow<unknown>[] {
  return JSON.parse(JSON.stringify(trace)) as readonly FakeNetworkTraceRow<unknown>[];
}
