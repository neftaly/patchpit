# Serverless WebRTC Signaling

Patchpit should support explicit same-room pairing without requiring a signaling
server. The first implementation target is a data-channel-only WebRTC transport
with manual QR exchange. This is a live-session rendezvous path, not the durable
social graph or document authorization layer.

## First Prototype

Use non-trickle ICE and two QR exchanges.

1. Peer A creates an `RTCPeerConnection`, creates a data channel, creates an
   offer, sets it as the local description, and waits for ICE gathering to
   complete.
2. Peer A displays a QR payload containing only the compact offer and pairing
   metadata.
3. Peer B scans, sets the offer as the remote description, creates an answer,
   sets it locally, waits for ICE gathering, then displays an answer QR.
4. Peer A scans the answer and sets it as the remote description.
5. Both peers show a short verification code derived from the paired session.

This is slower than trickle ICE but much easier to reason about with cameras,
iOS Safari, and no server.

## UX Shape

The human interaction can be casual:

- both people open the website
- both say or tap that they consent to join the session
- Patchpit chooses the available signaling channel
- QR is preferred when cameras work
- copy/share link is the fallback
- audio-modem signaling is an experiment after QR works

Voice consent is user experience and audit context. The browser still needs a
concrete offer/answer/candidate payload under it.

## Payload Rules

- Do not include documents, durable keys, delegation grants, private messages,
  or app contents in the QR.
- Keep the QR single-use and short-lived.
- Compress the session description before encoding when needed.
- Prefer compact JSON or CBOR-style shapes over verbose wrappers.
- Store diagnostics under runtime state unless the user explicitly saves them.

QR payloads can reveal network metadata and session intent. Treat every pairing
payload as a capability-bearing secret, even when it is displayed in the room.

## Candidate And NAT Notes

The transport configuration must accept STUN/TURN settings from policy. Same-LAN
data-channel pairing may still fail on iOS Safari depending on candidate
exposure, capture permissions, NAT, and network policy. Record candidate types,
ICE state, connection time, and failure reason in diagnostics.

Trickle ICE comes later, after there is a temporary rendezvous channel or a
better follow-up exchange UX. Without that, every late candidate becomes another
manual scan.

## Rejected Channels

Do not use covert channels such as deliberately stressing the router and reading
latency spikes. That crosses a permission boundary, is unreliable, and would be
hard to distinguish from abusive network behavior.

## Decomplection Notes

Keep the pieces separate:

- WebRTC adapter: opens data channels and reports transport diagnostics.
- Signaling channel: QR, share-sheet, copy/paste, audio, or relay.
- Sync/session protocol: decides what messages mean after bytes arrive.
- Authorization: decides whether a peer may join or receive a document.
- UI: explains pairing state and lets users cancel.

## Sources

- MDN WebRTC signaling and ICE overview:
  https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling
- MDN `RTCPeerConnection.createOffer()`:
  https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createOffer
- MDN `RTCPeerConnection.addIceCandidate()`:
  https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/addIceCandidate
- MDN perfect negotiation:
  https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
