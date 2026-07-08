# Sandbox Security

The sandbox runs app documents in an opaque-origin iframe with scripts enabled.
It aims to host a small local-first app profile, not arbitrary websites.
The `sandbox-compat` browser harness is the executable supported-profile spec.

## Current Boundary

- Host iframe uses `sandbox="allow-scripts"` and `referrerPolicy="no-referrer"`.
- The old data-URL bootstrap path has been removed.
- The package owns path planning, launch document creation, and URL mount
  request handling.
- URL mounts serve files with CORS headers for opaque-origin browser loaders.

## Polyfill Rules

- Polyfills may only emulate relative local file resolution.
- Do not parse or rewrite JavaScript or CSS source.
- Do not add fallback content, fallback network fetches, or placeholder assets.
- Unsupported browser features should fail normally until the supported profile
  explicitly includes them.
- Any global override must have a named browser behavior case and a security
  note explaining the boundary it changes.
- Test/debug reporting must stay test-only and must not become a runtime bridge.

## Known Gaps

- `sandbox-compat` records the desired browser behavior and current expected
  failures.
- Runtime mount lifecycle and cleanup are still owned by the caller.
- Native workers need a separate-origin runner profile, not the max opaque
  iframe profile.
