# Sandbox Security

The sandbox currently runs trusted app documents on Patchpit's origin with
scripts enabled. It aims to host a small local-first app profile, not arbitrary
websites.
The `sandbox-compat` browser harness is the executable supported-profile spec.

## Current Boundary

- Host iframe temporarily uses `sandbox="allow-scripts allow-same-origin"` and
  `referrerPolicy="no-referrer"` so a browser-local service worker can serve
  native relative URLs.
- Same-origin apps can access Patchpit and remove the iframe sandbox. Only
  trusted plugins may run in this profile; this is not an isolation boundary.
- The runner base URL is configurable so deployment can move to a distinct
  origin without changing app URLs. No cross-origin snapshot-transfer protocol
  exists yet.
- The old data-URL bootstrap path has been removed.
- The package owns path planning, launch document creation, and URL mount
  request handling.
- URL mounts serve files with explicit content types and restrictive response
  policy headers.
- Production URL mount ids are capability URLs and must be unguessable. Fixed
  ids are only for local compatibility harnesses.

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

- TODO: move mounts to a dedicated authority-free runner origin before
  accepting untrusted apps or claiming host isolation. The runner may remain
  local-first by caching its bootstrap and receiving app snapshots locally.
- `sandbox-compat` records the desired browser behavior and current expected
  failures.
- Its current URL mount serves a build fixture, not live Patchpit filesystem
  documents. Live launch requires an authority-complete immutable snapshot and
  a host-owned capability URL mount; debug or development middleware is not
  that boundary.
- Runtime mount lifecycle and cleanup are still owned by the caller.
- URL mounts currently support only simple `GET`/`HEAD` asset requests.
  `respond()` rejects other methods, including `OPTIONS` preflights.
- Native workers need a separate-origin runner profile, not the max opaque
  iframe profile.
