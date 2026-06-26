# Device Driver Factory

Patchpit should grow an ongoing driver factory for every part of the stack:
headsets, controllers, phones, browsers, cameras, microphones, local radios,
CAN-like buses, model runtimes, renderers, and future hardware bridges.

The factory is not an automation free-for-all. It is a repeatable path from
fixtures to live read-only observation to carefully granted control.

## Driver Stages

Every driver starts at the safest useful stage.

1. Simulator
   - deterministic fixtures
   - generated edge cases
   - no hardware required
   - golden replay logs
2. Parser
   - schema validation
   - fuzz tests
   - malformed input handling
   - source/provenance stamping
3. Replay
   - recorded event streams
   - clock skew and disconnect simulation
   - deterministic benchmark runs
4. Read-only live ingest
   - explicit device identity
   - permission state
   - dropped-event and error counters
   - local-only raw data by default
5. Proposed control
   - commands are rendered as proposals first
   - policy explains risk and reason
   - user confirms or rejects
   - replay log records the decision
6. Write-capable control
   - separate capability grant
   - narrow scope and expiry
   - reversible commands first
   - kill switch and revocation
   - post-action observation

No driver should skip straight to write-capable control.

## Common Interfaces

Drivers should expose source-stamped events, not raw authority.

```ts
type DriverEvent = {
  id: string;
  driver: string;
  source: string;
  kind: string;
  observedAt: string;
  confidence: number;
  payload: unknown;
  rawRef?: string;
};

type DriverCapability = {
  driver: string;
  source: string;
  action: string;
  mode: "read" | "propose" | "write";
  expiresAt?: string;
};
```

Renderers, agents, and UI panels consume events. They do not get direct device
handles.

## Capability Security

Driver authority is capability-based. A driver may observe only what its current
grant allows, and may write only when a separate grant exists for that exact
source, action, risk label, and time window.

Capability checks should cover:

- source identity and provenance
- requested action and mode
- schema validation result
- risk label
- expiry and revocation state
- user-visible reason
- replay-log entry before and after the decision

Denied commands must leave diagnostics but must not mutate device, scene, or
stored state.

## Threat Model

The main threats are accidental hardware effects, hidden sensing, data leakage,
malformed-device input, agent overreach, replay confusion, and UI deception.

Driver mitigations:

- default to simulator, replay, and read-only live ingest
- minimize and redact raw sensor/media data
- store sensitive raw data locally by default
- separate command proposals from command execution
- require explicit write grants with expiry and revocation
- log every grant, denial, executed command, adapter lifecycle event, and parse
  error
- fuzz parsers and bound allocation on hostile input
- keep renderers and agents away from raw handles
- make current capture/control state visible in the UI

## Native And Web Boundary

Keep the shareable product web-first. Native code is a companion bridge for
capabilities the browser cannot expose safely or reliably:

- USB, ADB, and browser DevTools control
- background capture
- camera/audio pipelines that need OS services
- BLE, Wi-Fi RTT, UWB, and other local radios
- hardware buses such as CAN, NMEA 2000, DeviceNet, serial, and GPIO
- native XR escape hatches when WebXR is not enough

Native companions publish schema-checked events over local loopback, local-first
sync, or an explicit peer session. They must show visible capture state and
support immediate stop/revoke.

## Package Shape

Start with the smallest shared core that prevents every driver from inventing
its own security model.

- `packages/driver-core`: shared specs, event/capability types, diagnostics,
  parser helpers, replay log format.
- `packages/driver-testkit`: seeded clocks, fake adapters, fuzz helpers,
  simulator runner, replay harness.
- `packages/driver-quest`: ADB/browser-devtools wrapper around the current
  Quest helper script.
- `packages/driver-canbus`: CAN/OBD/NMEA/DeviceNet-style simulator and
  read-only parser path.
- `packages/driver-infinigen`: scene stream, viewer command, WebXR/controller,
  and renderer capability events.
- `apps/driver-lab`: local inspection UI for devices, logs, grants, replay, and
  dry-run command proposals.

Promote only stable contracts into packages. Keep early UI experiments inside
apps until the event shape is proved.

## Test Harness

Each driver should ship with:

- simulator fixtures
- parser unit tests
- property/fuzz tests for malformed data
- replay logs for regressions
- pressure tests for bursty event streams
- permission/capability tests
- disconnect/reconnect tests
- privacy tests that prove raw sensitive data is not retained by default

Benchmarks should measure parse cost, ingest latency, dropped events, memory,
and time from observed source change to visible UI update.

## First Driver Candidates

- Quest browser/device bridge: USB visibility, ADB state, tabs, console logs,
  URL open, headset-friendly status.
- Infinigen browser sensor topology: microphone permission, media devices,
  controllers/gamepads, XR session state, tracking dropout reports.
- CAN bus bridge: simulator, parser, OBD/NMEA/DeviceNet-style event decoding,
  then read-only adapters.
- Local camera/audio capture: explicit foreground capture, local storage, and
  derived event summaries.
- WebRTC session driver: signaling state, ICE state, data-channel health, packet
  counters, and replayable failure cases.
- Renderer capability driver: WebGL/WebXR feature facts, frame timing, memory
  pressure, and fallback decisions.

## Factory Loop

For each new driver thread:

1. Add a driver spec.
2. Generate simulator fixtures.
3. Implement pure parser and schema validation.
4. Add replay logs and deterministic tests.
5. Expose source-stamped read rows.
6. Add a capability matrix.
7. Add read-only live adapter.
8. Add dry-run command proposals.
9. Add write-capable adapter only behind brokered grants.

## Decomplection Notes

Keep driver IO, parsing, policy, storage, replay, rendering, and agent
reasoning separate. A scene object can represent a boat engine, headset, or dog,
but the scene must not hold the authority to command that real-world object.
