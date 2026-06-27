# Secure Scuttlebutt Integration Plan

SSB is a required Patchpit substrate. The role is durable social trust,
friend-group naming, offline history, and eventually a bridge into cooperative
governance. It should not be treated as the only live transport for low-latency
sessions.

## Product Role

Patchpit should use SSB for:

- durable identity and social graph signals
- private friend-group naming
- append-only session announcements and topic history
- trusted discovery of people, places, activities, apps, and documents
- asynchronous handoff across network partitions

Patchpit should use WebRTC, WebTransport, LAN, or local sockets for:

- live scene sync
- large file transfer
- high-frequency cursor/controller/presence state
- same-room pairing
- low-latency multiplayer

The user experience can present one social action: join a trusted session. The
runtime can then choose SSB for durable context and WebRTC/QR for the live pipe.

## Bridge First

The browser should not start by reimplementing SSB. Start with a local bridge:

1. Run a local Node service built on `secret-stack`, `ssb-db2`, `ssb-conn`,
   `ssb-friends`, `ssb-blobs`, and `ssb-room-client`.
2. Detect or configure an existing local SSB identity and repo.
3. Read a bounded view of identities, follows, names, topic messages, app refs,
   share grants, moderation signals, and content-addressed pointers.
4. Expose derived, privacy-preserving rows to Patchpit over localhost.
5. Keep raw feed data behind an explicit capability.
6. Record replication lag, missing feeds, rooms, pubs, blocked peers, and
   partition state as diagnostics.

The first useful bridge can be read-only. Publishing and private messages should
come after capability policy, content safety, and replay logs are in place.

Avoid direct browser SSB as the first dependency. Browser storage, multi-tab
coordination, TCP/UDP limitations, and slow replication are all real risks. A
localhost bridge lets Patchpit use the mature Node SSB stack while the browser
keeps a simple, schema-checked capability surface.

## Friend-Group DNS

Patchpit can add a local naming layer above SSB.

A name is a scoped claim, not a global truth:

```json
{
  "name": "boat",
  "scope": "friend-circle",
  "target": "patchpit-topic-or-doc-id",
  "author": "ssb-feed-id",
  "confidence": 0.8,
  "updatedAt": "2026-06-26T00:00:00.000Z"
}
```

Rules:

- Names are resolved relative to a circle, device, and current task.
- Conflicts are expected and shown, not hidden.
- A trusted friend can make a name more visible, but cannot silently overwrite
  another user's local meaning.
- Private names must not leak into URLs, query strings, public logs, or app
  telemetry.
- Names can resolve to documents, sessions, places, people, activities, files,
  apps, or prompts.

This is closer to social memory than DNS. The benchmark is whether people can
say the shared word they already use and arrive at the intended thing.

## Network Partitions

SSB's slow or partitioned replication is a design constraint, not a reason to
drop it.

Patchpit should surface:

- latest known peer/contact state
- how stale each source is
- which topic messages are available locally
- which writes are queued locally
- which live rendezvous path is currently possible

Never block a same-room session on global SSB convergence. Use QR/WebRTC to form
the live session, then backfill durable SSB context when replication catches up.

Rooms and pubs are connectivity aids, not authorities. They may help peers find
each other across NATs or partitions, but trust still comes from signed feeds,
explicit Patchpit grants, and local policy.

## Content Safety

SSB can replicate material the current user did not intentionally request. Every
SSB bridge needs gates before rendering, indexing, summarizing, or forwarding:

- known-bad hash blocklists when available
- local quarantine for high-risk unknown blobs
- no preview thumbnails for quarantined media
- no agent summarization of quarantined media
- friend/trust policy before fetching blobs
- per-topic and per-peer deny/allow controls
- minimal diagnostics that do not store harmful content

## First Prototype

Build a local fixture-backed SSB bridge before touching real feeds:

- package owner: a future `@patchpit/ssb-bridge`
- inputs: feed summaries, contact edges, topic messages, blob metadata
- outputs: derived rows for identities, names, topics, and diagnostics
- tests: partitioned feed, conflicting names, blocked blob, stale peer, revoked
  trust, oversized topic, malformed message
- shell surface: `/patchpit/ssb`, `/patchpit/run/ssb`, and diagnostics

The second prototype can connect to a local SSB node and import only the same
derived rows. The localhost service shape should be small:

- `GET /identity`
- `GET /topics`
- `GET /trust/feed/:id`
- `GET /events` for accepted Patchpit messages
- `POST /connect` for multiserver or room addresses
- `POST /publish` for validated `patchpit/*` messages

Core Patchpit documents remain outside SSB. SSB stores signed social events,
topic announcements, app refs, share grants, presence summaries, moderation
signals, and content-addressed pointers.

## Lineage

Secure Scuttlebutt was created by Dominic Tarr and the SSB community as an
offline-friendly, peer-to-peer, append-only social protocol. Patchpit should
honor that lineage by keeping identity, trust, gossip, and local ownership
visible rather than hiding them behind platform accounts.

## Sources

- Scuttlebutt project site: https://scuttlebutt.nz/
- Scuttlebutt protocol guide: https://ssbc.github.io/scuttlebutt-protocol-guide/
- `ssb-db2`: https://github.com/ssbc/ssb-db2
- `ssb-conn`: https://github.com/ssbc/ssb-conn
- `ssb-room-client`: https://github.com/ssbc/ssb-room-client
