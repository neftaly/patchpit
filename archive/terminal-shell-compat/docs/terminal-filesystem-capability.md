# Terminal Filesystem Capability

`terminal.filesystem` exposes a scoped `just-bash` filesystem over a capability
port. The terminal app package owns this subprotocol; the core runtime only
dispatches registered capability providers.

The grant endpoint is explicit:

```ts
const terminalFilesystemCapability = 'terminal.filesystem';
const terminalFilesystemProtocol = 'patchpit.terminal.filesystem@1';

type TerminalFilesystemCapabilityGrant = CapabilityGrant & {
  capability: 'terminal.filesystem';
  verbs: readonly ('read' | 'write' | 'stat' | 'list' | 'mount')[];
  endpoint: {
    protocol: 'patchpit.terminal.filesystem@1';
    rootUrl: string;
    rootUrls: readonly string[];
    initialPaths: readonly string[];
    initialPathsByRoot?: Readonly<Record<string, readonly string[]>>;
  };
};
```

Port traffic is request/response. `rootUrl` selects the mounted Automerge root
for the operation, so overlay mounts use the same capability without receiving
broad filesystem authority.

```ts
type TerminalFilesystemRequest = {
  protocol: 'patchpit.terminal.filesystem@1';
  id: string;
  capabilityId: string;
  rootUrl: string;
  op: TerminalFilesystemOperation;
  args: readonly unknown[];
};

type TerminalFilesystemResponse =
  | { protocol: 'patchpit.terminal.filesystem@1'; id: string; ok: true; result?: unknown }
  | { protocol: 'patchpit.terminal.filesystem@1'; id: string; ok: false; error: { code?: string; message: string } }
  | { protocol: 'patchpit.terminal.filesystem@1'; type: 'closed'; error: { code?: string; message: string } };
```

`rootUrls` is an allow-list. The server rejects requests for roots outside the
grant. Copy and move require both `read` and `write` verbs.
`initialPathsByRoot` seeds the client's synchronous `getAllPaths()` cache;
successful path-changing operations update that cache locally instead of forcing
a full server tree walk. The serving side sends `type: 'closed'` before
revocation so clients can reject in-flight filesystem calls.
