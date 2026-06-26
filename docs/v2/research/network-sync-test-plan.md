# Network Sync Test Plan

This note sets direction for networking and Sedimentree-facing sync tests. The
main thread should marshal work and observe state; transport behavior should be
tested through a deterministic fake network before depending on real sockets.

## Direction

Build a transport-independent fake network and sync testkit first.

The testkit should let sync code run against scripted peers, clocks, packet
delivery, failures, and resource limits without binding the tests to WebSocket,
WebRTC, service worker, or worker-thread details.

Sedimentree and Beelay integration tests should come later, after the transport
contract and failure traces are stable.

## Testkit Shape

The first artifact should provide:

- deterministic peer traces with seeded scheduling
- explicit send, receive, delay, drop, duplicate, and reorder controls
- bounded queues for backpressure tests
- chunking cases for messages larger than a configured frame size
- reconnect and resume scripts with repeated disconnects
- capability grant, denial, and revocation fixtures
- malicious peer scripts that send malformed, excessive, replayed, or
  unauthorized messages
- resource metrics for queued bytes, delivered bytes, message counts, retries,
  dropped work, and retained peer state

Tests should assert traces and final state, not wall-clock timing.

## Coverage Targets

Start with transport-agnostic sync cases:

- clean two-peer exchange
- interrupted exchange with reconnect
- backpressure under a slow receiver
- chunked message delivery and partial failure
- duplicate and out-of-order delivery
- capability denial before any durable mutation is accepted
- malicious peer pressure that is rejected without unbounded memory growth
- resource accounting after peers disconnect or are denied

Then add integration coverage:

- Sedimentree sync against the fake network contract
- Beelay peer behavior against the same traces
- one real transport smoke test per transport once the fake-network cases pass

## Main Thread Boundary

Keep the main thread as a marshal:

- start and stop sessions
- route messages between runtime surfaces and workers/transports
- expose observable session state and diagnostics
- avoid owning sync algorithm state, retry policy, or heavy decode/apply work

Any future UI-facing sync surface should consume session state rather than
driving transport policy directly.

## Risks

- Real transport tests without deterministic traces will miss retry and
  backpressure regressions.
- Fake networks can become unrealistic if they do not model queue limits,
  chunking, reconnect, and denial paths.
- Malicious peer tests need resource assertions, not only rejection assertions.
- Sedimentree/Beelay integration should not bake WebSocket-specific behavior
  into the core sync contract.

## Decomplection Notes

Keep transport adapters, sync protocol state, capability policy, resource
accounting, and UI/session observation as separate owners. The fake network
should exercise the contract between them without becoming a production
transport.
