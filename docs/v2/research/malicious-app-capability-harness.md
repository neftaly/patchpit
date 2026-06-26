# Malicious App Capability Harness

This note scopes the first malicious-app capability harness. It is a test
fixture below real Beelay/Keyhive integration and below browser same-origin
sandboxing. The goal is to make app-host policy observable before any runtime
is complex enough to hide ambient access again.

## Threat Model

- A hostile app tries to read namespace paths or docs it was not granted.
- A hostile app sends malformed writes and hopes partial validation mutates
  workspace state.
- A hostile app floods output to consume host memory or make diagnostics
  unusable.
- The main-thread boundary is only a marshal point in this harness. Policy
  lives in the fake host, not in app fixture code.

## Harness Metrics

- Capability decisions: every host request records allow/deny, action, target,
  app id, and reason.
- Diagnostics: denied reads/writes, schema rejections, and dropped output are
  explicit records that tests can assert.
- State safety: writes validate against a tiny note schema before replacing
  in-memory namespace/doc state.
- Output pressure: output is bounded by byte and record limits, adjacent
  identical chunks are coalesced, and dropped chunks/bytes are counted.
- Surface area: tests can compare an ambient host shape with the smaller set of
  explicit grants.

## Staged Next Steps

1. Add more malicious fixtures for path traversal, confused-deputy requests,
   oversized writes, and cross-app output spoofing.
2. Move the request/response vocabulary next to the first real app host once
   Patchpit has one, keeping this fake harness as a fast regression suite.
3. Add browser-level same-origin and iframe sandbox tests after the shell owns
   real app embedding.
4. Add Keyhive/Beelay authorization tests after document identity and sharing
   semantics exist.

## Non-Claims

- No real cryptography, identity, signatures, or Keyhive authorization.
- No real Beelay replication or network behavior.
- No real iframe sandboxing, CSP, permissions policy, or browser API
  containment.
- No claim that malicious JavaScript is isolated from the test process. The
  fixture only verifies host-side capability checks over a marshalled API.
