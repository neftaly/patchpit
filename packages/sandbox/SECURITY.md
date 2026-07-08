# Sandbox Security

The sandbox runs app documents in an opaque-origin iframe with scripts enabled.
It aims to host a small local-first app profile, not arbitrary websites.

## Current Boundary

- Host iframe uses `sandbox="allow-scripts"` and `referrerPolicy="no-referrer"`.
- Sandbox CSP defaults to `default-src 'none'` and only permits data-backed
  subresources needed by the current model.
- Relative local files are projected into the iframe; absolute URLs stay
  browser-owned.
- The sandbox may still navigate itself. CSP is not treated as total network
  isolation.

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

- Relative module imports do not work in the current data-URL model.
- CSS `url()`, CSS `@import`, `srcset`, dynamic imports, and workers are not
  established as supported.
- Large app graphs may exceed practical data-URL size or load-time limits.
