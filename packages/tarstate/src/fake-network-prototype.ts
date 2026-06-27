export type FakePeerId = string;

export type FakeNetworkTraceRow<Payload = unknown> =
  | FakeNetworkEventRow
  | FakePeerStateRow
  | FakeMessageDeliveryRow<Payload>
  | FakeDiagnosticRow;

export type FakeNetworkEventRow = {
  readonly row: 'network_event';
  readonly at: number;
  readonly order: number;
  readonly event:
    | 'peer_registered'
    | 'send'
    | 'drop'
    | 'duplicate'
    | 'chunk'
    | 'schedule'
    | 'inject'
    | 'backpressure_drop'
    | 'run_start'
    | 'run_end';
  readonly peerId?: FakePeerId;
  readonly from?: FakePeerId;
  readonly to?: FakePeerId;
  readonly messageId?: string;
  readonly reason?: string;
  readonly count?: number;
};

export type FakePeerStateRow = {
  readonly row: 'peer_state';
  readonly at: number;
  readonly order: number;
  readonly peerId: FakePeerId;
  readonly state: unknown;
};

export type FakeMessageDeliveryRow<Payload = unknown> = {
  readonly row: 'message_delivery';
  readonly at: number;
  readonly order: number;
  readonly event: 'scheduled' | 'delivered' | 'blocked';
  readonly message: FakeNetworkMessage<Payload>;
};

export type FakeDiagnosticRow = {
  readonly row: 'diagnostic';
  readonly at: number;
  readonly order: number;
  readonly severity: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly peerId?: FakePeerId;
  readonly messageId?: string;
  readonly detail?: unknown;
};

export type FakeNetworkMessage<Payload = unknown> = {
  readonly id: string;
  readonly from: FakePeerId;
  readonly to: FakePeerId;
  readonly payload: Payload;
  readonly createdAt: number;
  readonly copy: number;
  readonly chunk?: FakeMessageChunk;
  readonly malformed?: boolean;
  readonly malicious?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type FakeMessageChunk = {
  readonly index: number;
  readonly count: number;
  readonly messageId: string;
};

export type FakeNetworkReceive<Payload> = (
  message: FakeNetworkMessage<Payload>,
  api: FakePeerApi<Payload>
) => void;

export type FakePeerApi<Payload> = {
  readonly now: () => number;
  readonly send: (
    from: FakePeerId,
    to: FakePeerId,
    payload: Payload,
    options?: FakeSendOptions
  ) => string;
  readonly broadcast: (
    from: FakePeerId,
    payload: Payload,
    options?: FakeBroadcastOptions
  ) => readonly string[];
  readonly recordPeerState: (peerId: FakePeerId, state: unknown) => void;
  readonly diagnostic: (diagnostic: FakeDiagnosticInput) => void;
};

export type FakeDiagnosticInput = {
  readonly severity?: 'info' | 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly peerId?: FakePeerId;
  readonly messageId?: string;
  readonly detail?: unknown;
};

export type FakeNetworkOptions<Payload> = {
  readonly seed?: number | string;
  readonly peers?: readonly FakePeerId[];
  readonly policy?: FakeNetworkPolicy<Payload>;
};

export type FakeNetworkPolicy<Payload> = {
  readonly drop?: FakePolicyDecision<Payload>;
  readonly duplicate?: number | FakePolicyNumber<Payload>;
  readonly delay?: FakeDelay<Payload>;
  readonly reorder?: boolean | FakePolicyDecision<Payload>;
  readonly chunk?: (context: FakePolicyContext<Payload>) => readonly Payload[] | undefined;
  readonly backpressureWindow?: number | ((peerId: FakePeerId) => number | undefined);
  readonly validate?: (message: FakeNetworkMessage<Payload>) => FakeValidationResult;
  readonly malicious?: (
    context: FakePolicyContext<Payload>,
    rng: FakeRandom
  ) => readonly FakeInjectedMessage<Payload>[] | undefined;
};

export type FakePolicyContext<Payload> = {
  readonly message: FakeNetworkMessage<Payload>;
  readonly attempt: number;
  readonly now: number;
};

export type FakePolicyDecision<Payload> = (
  context: FakePolicyContext<Payload>,
  rng: FakeRandom
) => boolean | string | undefined;

export type FakePolicyNumber<Payload> = (
  context: FakePolicyContext<Payload>,
  rng: FakeRandom
) => number;

export type FakeDelay<Payload> =
  | number
  | { readonly min: number; readonly max: number }
  | ((context: FakePolicyContext<Payload>, rng: FakeRandom) => number);

export type FakeValidationResult =
  | false
  | string
  | {
      readonly code?: string;
      readonly message: string;
      readonly severity?: 'warning' | 'error';
      readonly detail?: unknown;
    }
  | undefined;

export type FakeInjectedMessage<Payload> = {
  readonly from: FakePeerId;
  readonly to: FakePeerId;
  readonly payload: Payload;
  readonly delay?: number;
  readonly malformed?: boolean;
  readonly malicious?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type FakeSendOptions = {
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type FakeBroadcastOptions = FakeSendOptions & {
  readonly includeSelf?: boolean;
};

export type FakeRandom = {
  readonly next: () => number;
  readonly int: (min: number, max: number) => number;
  readonly chance: (probability: number) => boolean;
};

type ScheduledEvent = {
  readonly at: number;
  readonly order: number;
  readonly run: () => void;
};

export class FakeNetwork<Payload = unknown> {
  readonly trace: FakeNetworkTraceRow<Payload>[] = [];

  private readonly policy: FakeNetworkPolicy<Payload>;
  private readonly rng: SeededRandom;
  private readonly peers = new Map<FakePeerId, FakeNetworkReceive<Payload>>();
  private readonly queue: ScheduledEvent[] = [];
  private readonly inFlightByPeer = new Map<FakePeerId, number>();
  private time = 0;
  private order = 0;
  private messageSequence = 0;

  constructor(options: FakeNetworkOptions<Payload> = {}) {
    this.policy = options.policy ?? {};
    this.rng = new SeededRandom(options.seed ?? 1);

    for (const peerId of options.peers ?? []) {
      this.registerPeer(peerId);
    }
  }

  now(): number {
    return this.time;
  }

  registerPeer(peerId: FakePeerId, receive?: FakeNetworkReceive<Payload>): void {
    this.peers.set(peerId, receive ?? this.peers.get(peerId) ?? (() => undefined));
    this.pushNetworkEvent({ event: 'peer_registered', peerId });
  }

  onMessage(peerId: FakePeerId, receive: FakeNetworkReceive<Payload>): void {
    this.registerPeer(peerId, receive);
  }

  send(from: FakePeerId, to: FakePeerId, payload: Payload, options: FakeSendOptions = {}): string {
    const message = this.createMessage(from, to, payload, 0, undefined, false, false, options.metadata);
    this.pushNetworkEvent({ event: 'send', from, to, messageId: message.id });
    this.applyOutboundPolicy(message, 0);
    this.applyMaliciousPolicy(message);
    return message.id;
  }

  broadcast(
    from: FakePeerId,
    payload: Payload,
    options: FakeBroadcastOptions = {}
  ): readonly string[] {
    const sent: string[] = [];
    for (const peerId of this.peers.keys()) {
      if (peerId === from && !options.includeSelf) {
        continue;
      }
      sent.push(this.send(from, peerId, payload, options));
    }
    return sent;
  }

  recordPeerState(peerId: FakePeerId, state: unknown): void {
    this.trace.push({
      row: 'peer_state',
      at: this.time,
      order: this.nextOrder(),
      peerId,
      state: snapshot(state)
    });
  }

  diagnostic(input: FakeDiagnosticInput): void {
    this.trace.push({
      row: 'diagnostic',
      at: this.time,
      order: this.nextOrder(),
      severity: input.severity ?? 'warning',
      code: input.code,
      message: input.message,
      ...(input.peerId === undefined ? {} : { peerId: input.peerId }),
      ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
      ...(input.detail === undefined ? {} : { detail: snapshot(input.detail) })
    });
  }

  runUntilIdle(maxEvents = 10_000): void {
    this.pushNetworkEvent({ event: 'run_start', count: this.queue.length });
    let delivered = 0;

    while (this.queue.length > 0) {
      if (delivered >= maxEvents) {
        this.diagnostic({
          severity: 'error',
          code: 'scheduler_limit',
          message: `stopped after ${maxEvents} scheduled events`,
          detail: { remaining: this.queue.length }
        });
        break;
      }

      const event = this.popEvent();
      this.time = event.at;
      event.run();
      delivered += 1;
    }

    this.pushNetworkEvent({ event: 'run_end', count: delivered });
  }

  private applyOutboundPolicy(message: FakeNetworkMessage<Payload>, attempt: number): void {
    const context = this.contextFor(message, attempt);
    const dropReason = decide(this.policy.drop, context, this.rng);
    if (dropReason) {
      this.pushNetworkEvent({
        event: 'drop',
        from: message.from,
        to: message.to,
        messageId: message.id,
        reason: dropReason === true ? 'policy' : dropReason
      });
      return;
    }

    const chunks = this.policy.chunk?.(context);
    const payloads = chunks && chunks.length > 0 ? chunks : [message.payload];
    if (payloads.length > 1) {
      this.pushNetworkEvent({
        event: 'chunk',
        from: message.from,
        to: message.to,
        messageId: message.id,
        count: payloads.length
      });
    }

    payloads.forEach((payload, index) => {
      const chunk =
        payloads.length > 1
          ? { index, count: payloads.length, messageId: message.id }
          : undefined;
      const chunkMessage =
        index === 0 && payloads.length === 1
          ? message
          : this.createMessage(
              message.from,
              message.to,
              payload,
              0,
              chunk,
              message.malformed ?? false,
              message.malicious ?? false,
              message.metadata
            );
      const copyCount = Math.max(1, 1 + Math.floor(readNumber(this.policy.duplicate, context, this.rng)));

      for (let copy = 0; copy < copyCount; copy += 1) {
        const copyMessage =
          copy === 0
            ? chunkMessage
            : this.createMessage(
                chunkMessage.from,
                chunkMessage.to,
                chunkMessage.payload,
                copy,
                chunkMessage.chunk,
                chunkMessage.malformed ?? false,
                chunkMessage.malicious ?? false,
                chunkMessage.metadata
              );
        if (copy > 0) {
          this.pushNetworkEvent({
            event: 'duplicate',
            from: copyMessage.from,
            to: copyMessage.to,
            messageId: copyMessage.id,
            count: copy
          });
        }
        this.scheduleDelivery(copyMessage, this.deliveryDelay(copyMessage, copy));
      }
    });
  }

  private applyMaliciousPolicy(message: FakeNetworkMessage<Payload>): void {
    const injected = this.policy.malicious?.(this.contextFor(message, 0), this.rng) ?? [];
    for (const injection of injected) {
      const injectedMessage = this.createMessage(
        injection.from,
        injection.to,
        injection.payload,
        0,
        undefined,
        injection.malformed ?? false,
        injection.malicious ?? true,
        injection.metadata
      );
      this.pushNetworkEvent({
        event: 'inject',
        from: injectedMessage.from,
        to: injectedMessage.to,
        messageId: injectedMessage.id
      });
      this.scheduleDelivery(injectedMessage, injection.delay ?? 0);
    }
  }

  private scheduleDelivery(message: FakeNetworkMessage<Payload>, delay: number): void {
    const window = this.backpressureWindow(message.to);
    const inFlight = this.inFlightByPeer.get(message.to) ?? 0;
    if (window !== undefined && inFlight >= window) {
      this.pushNetworkEvent({
        event: 'backpressure_drop',
        from: message.from,
        to: message.to,
        messageId: message.id,
        reason: `window ${window} exceeded`
      });
      this.diagnostic({
        severity: 'warning',
        code: 'backpressure_drop',
        message: `dropped ${message.id} for ${message.to}: backpressure window ${window} exceeded`,
        peerId: message.to,
        messageId: message.id,
        detail: { window, inFlight }
      });
      return;
    }

    this.inFlightByPeer.set(message.to, inFlight + 1);
    const at = this.time + Math.max(0, Math.floor(delay));
    this.pushNetworkEvent({
      event: 'schedule',
      from: message.from,
      to: message.to,
      messageId: message.id
    });
    this.trace.push({
      row: 'message_delivery',
      at,
      order: this.nextOrder(),
      event: 'scheduled',
      message
    });
    this.queue.push({
      at,
      order: this.nextOrder(),
      run: () => this.deliver(message)
    });
    this.queue.sort(compareScheduledEvents);
  }

  private deliver(message: FakeNetworkMessage<Payload>): void {
    this.inFlightByPeer.set(message.to, Math.max(0, (this.inFlightByPeer.get(message.to) ?? 1) - 1));

    const validation = this.policy.validate?.(message);
    if (validation) {
      const diagnostic = validationDiagnostic(validation);
      this.trace.push({
        row: 'message_delivery',
        at: this.time,
        order: this.nextOrder(),
        event: 'blocked',
        message
      });
      this.diagnostic({
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        peerId: message.to,
        messageId: message.id,
        detail: diagnostic.detail
      });
      return;
    }

    const receive = this.peers.get(message.to);
    if (!receive) {
      this.diagnostic({
        severity: 'error',
        code: 'unknown_peer',
        message: `no peer registered for ${message.to}`,
        peerId: message.to,
        messageId: message.id
      });
      return;
    }

    this.trace.push({
      row: 'message_delivery',
      at: this.time,
      order: this.nextOrder(),
      event: 'delivered',
      message
    });

    try {
      receive(message, this.peerApi());
    } catch (error) {
      this.diagnostic({
        severity: 'error',
        code: 'peer_receive_error',
        message: error instanceof Error ? error.message : 'peer receive failed',
        peerId: message.to,
        messageId: message.id,
        detail: String(error)
      });
    }
  }

  private deliveryDelay(message: FakeNetworkMessage<Payload>, attempt: number): number {
    const context = this.contextFor(message, attempt);
    const baseDelay = readDelay(this.policy.delay, context, this.rng);
    const shouldReorder = this.policy.reorder === true || decide(this.policy.reorder, context, this.rng) === true;
    return shouldReorder ? baseDelay + this.rng.int(0, 5) : baseDelay;
  }

  private backpressureWindow(peerId: FakePeerId): number | undefined {
    const window = this.policy.backpressureWindow;
    return typeof window === 'function' ? window(peerId) : window;
  }

  private peerApi(): FakePeerApi<Payload> {
    return {
      now: () => this.now(),
      send: (from, to, payload, options) => this.send(from, to, payload, options),
      broadcast: (from, payload, options) => this.broadcast(from, payload, options),
      recordPeerState: (peerId, state) => this.recordPeerState(peerId, state),
      diagnostic: (diagnostic) => this.diagnostic(diagnostic)
    };
  }

  private createMessage(
    from: FakePeerId,
    to: FakePeerId,
    payload: Payload,
    copy: number,
    chunk: FakeMessageChunk | undefined,
    malformed: boolean,
    malicious: boolean,
    metadata: Readonly<Record<string, unknown>> | undefined
  ): FakeNetworkMessage<Payload> {
    this.messageSequence += 1;
    return {
      id: `m${this.messageSequence}`,
      from,
      to,
      payload,
      createdAt: this.time,
      copy,
      ...(chunk === undefined ? {} : { chunk }),
      ...(malformed ? { malformed } : {}),
      ...(malicious ? { malicious } : {}),
      ...(metadata === undefined ? {} : { metadata })
    };
  }

  private contextFor(message: FakeNetworkMessage<Payload>, attempt: number): FakePolicyContext<Payload> {
    return {
      message,
      attempt,
      now: this.time
    };
  }

  private pushNetworkEvent(row: Omit<FakeNetworkEventRow, 'row' | 'at' | 'order'>): void {
    this.trace.push({
      row: 'network_event',
      at: this.time,
      order: this.nextOrder(),
      ...row
    });
  }

  private popEvent(): ScheduledEvent {
    const event = this.queue.shift();
    if (!event) {
      throw new Error('scheduler queue is empty');
    }
    return event;
  }

  private nextOrder(): number {
    this.order += 1;
    return this.order;
  }
}

export function createFakeNetwork<Payload = unknown>(
  options: FakeNetworkOptions<Payload> = {}
): FakeNetwork<Payload> {
  return new FakeNetwork(options);
}

class SeededRandom implements FakeRandom {
  private state: number;

  constructor(seed: number | string) {
    this.state = normalizeSeed(seed);
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === 'number') {
    return seed >>> 0;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function decide<Payload>(
  decision: boolean | FakePolicyDecision<Payload> | undefined,
  context: FakePolicyContext<Payload>,
  rng: FakeRandom
): boolean | string | undefined {
  return typeof decision === 'function' ? decision(context, rng) : decision;
}

function readNumber<Payload>(
  value: number | FakePolicyNumber<Payload> | undefined,
  context: FakePolicyContext<Payload>,
  rng: FakeRandom
): number {
  return typeof value === 'function' ? value(context, rng) : value ?? 0;
}

function readDelay<Payload>(
  delay: FakeDelay<Payload> | undefined,
  context: FakePolicyContext<Payload>,
  rng: FakeRandom
): number {
  if (delay === undefined) {
    return 0;
  }
  if (typeof delay === 'number') {
    return delay;
  }
  if (typeof delay === 'function') {
    return delay(context, rng);
  }
  return rng.int(delay.min, delay.max);
}

function validationDiagnostic(validation: Exclude<FakeValidationResult, false | undefined>): {
  readonly severity: 'warning' | 'error';
  readonly code: string;
  readonly message: string;
  readonly detail?: unknown;
} {
  if (typeof validation === 'string') {
    return {
      severity: 'error',
      code: 'malformed_message',
      message: validation
    };
  }
  return {
    severity: validation.severity ?? 'error',
    code: validation.code ?? 'malformed_message',
    message: validation.message,
    detail: validation.detail
  };
}

function compareScheduledEvents(left: ScheduledEvent, right: ScheduledEvent): number {
  return left.at - right.at || left.order - right.order;
}

function snapshot(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}
