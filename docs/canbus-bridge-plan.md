# CAN Bus Bridge Plan

Patchpit should prototype CAN bus support because the same abstraction applies
to boats, old cars, embedded devices, factory floors, and repair sessions.

The product is not an industrial automation pivot. The product is a local-first
experience layer that can safely observe real systems and help people reason
about them.

## First Prototype

Build a simulator and parser before connecting hardware.

- package: future `@patchpit/canbus`
- inputs: CAN id, payload bytes, timestamp, bus/source id, adapter metadata
- outputs: normalized source-stamped events
- first domains: generic CAN frames, OBD-II diagnostics, NMEA 2000-style
  navigation/engine events, DeviceNet-style machine events
- tests: malformed frames, unsupported ids, duplicate/replayed frames, burst
  pressure, clock skew, impossible values, and adapter disconnects

No write frames in the first prototype.

## Hardware Path

Adapters are pluggable effects:

- simulator fixture
- log replay
- Bluetooth CAN/OBD adapter
- serial/USB CAN adapter
- ESP32-class bridge
- future network bridge

Every adapter reports:

- source id
- adapter type
- read/write capability
- firmware/version when known
- connection state
- dropped frames
- parse errors
- last-seen timestamp

## Capability Rules

Read-only is the default.

High-risk actions require a separate capability flow:

- clearing vehicle codes
- actuator tests
- writing control frames
- changing configuration
- sending proprietary commands
- controlling boat or factory systems

The UI should show the proposed action, source, risk, policy decision, reason,
and replay log before execution.

## Expert Mechanic Copilot

The mechanic copilot consumes observations, not raw bus access.

Inputs:

- read-only CAN/OBD/NMEA events
- photos/video
- symptoms
- vehicle/boat/machine metadata
- tool inventory
- user confirmations

Outputs:

- observations
- likely causes with confidence
- one next physical step
- safety warnings
- when to stop and consult a human expert

## VR Digital Twin

The same event stream can drive spatial scenes:

- boat instruments and engine state
- old vehicle diagnostics
- factory floor machine status
- alarms and flow state
- replay timelines

Start with read-only visualization, then add proposed-control overlays only
after capability and safety tests are strong.

## Decomplection Notes

Keep frame parsing, domain decoding, adapter IO, policy, replay logs, expert
diagnosis, and VR rendering separate. A renderer should never be able to send a
bus frame directly.
