# TODO

## Agent Handoff Goals

- Keep separating shell, filesystem, workspace, and app runtime ownership.
- Move remaining pure workspace state logic out of React provider code.
- Keep app instance state discoverable through filesystem paths under `/patchpit/run`.
- Reduce bundle cost by simplifying code boundaries before changing build config.
