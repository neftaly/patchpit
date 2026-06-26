# Content Safety Threat Model

Patchpit's threat model is broader than data theft. The system must ask:

- can this make the user feel unsafe, ashamed, manipulated, or overwhelmed?
- can this get the user, collaborator, cooperative, or host in legal trouble?
- can this expose private relationships, locations, documents, or intentions?
- can this cause financial, reputational, physical, or psychological harm?

This note is product and engineering guidance, not legal advice. Jurisdiction
specific handling needs counsel and local reporting procedures.

## Harm Categories

Legal exposure:

- illegal or objectionable media
- CSAM or child exploitation material
- non-consensual intimate imagery
- copyright-infringing imports or generated assets
- defamation, harassment, threats, or doxxing
- regulated data such as health, finance, school, or government records

Psychological and dignity harm:

- shock, disgust, shame, fear, or trauma from unexpected material
- humiliation from private content appearing on a shared screen
- dark-pattern pressure, scarcity anxiety, social comparison, or FOMO
- loss of agency from agents acting without visible approval

Privacy and social harm:

- leaking private docs through URLs, query strings, logs, screenshots, previews,
  browser sync, analytics, or model prompts
- exposing a social graph, family context, funder strategy, or collaborator list
- accidental publication of internal commercial reasoning
- identity confusion from friend-group names resolving in the wrong context

Financial and reputation harm:

- runaway inference/API spend
- funder or client trust damage from leaked drafts
- scams, fake invoices, or malicious connector imports
- agent output presented as the user's final position without review

Physical and device harm:

- unsafe repair instructions
- uncontrolled HomeKit/local-device commands
- VR discomfort or poor accessibility
- unsafe movement while wearing a headset

## Policy Boundary

Safety gates must run before content is:

- rendered
- thumbnailed
- indexed
- summarized
- sent to an agent
- replicated to another peer
- embedded in a generated app
- included in diagnostics or benchmarks

If the policy state is unknown, default to a safe placeholder and ask for
explicit user action.

## CSAM And Illegal Material Handling

Do not build a workflow where agents casually inspect, describe, retain, or
train on suspected CSAM or illegal material.

Preferred behavior:

- block known-bad hashes before display or indexing
- quarantine suspected media without preview
- store only minimal metadata needed for user safety and legal escalation
- avoid copying or transforming the material
- prevent sync/replication by default
- never include the material in prompts, logs, screenshots, generated apps, or
  training datasets
- provide a clear local escalation path appropriate to the user's jurisdiction
- preserve user safety and false-positive review paths without exposing the
  content to unnecessary reviewers

For New Zealand deployments, treat objectionable publications and takedown
requirements as a legal-compliance area requiring current legal review.

## Granular Benchmarks

Measure whether the safety system prevents harm without becoming unusable:

| Risk | Metric | Target |
| --- | --- | --- |
| surprise exposure | blocked-before-render rate | high for known risky inputs |
| false positives | user recoveries without raw-content exposure | possible and audited |
| legal exposure | raw illegal-content copies after detection | zero by design |
| privacy leak | sensitive tokens in URLs/logs/prompts | zero in tests |
| psychological harm | user reports of shock/overwhelm | decreasing over runs |
| agency loss | actions requiring explicit approval that skipped approval | zero |
| cost anxiety | visible budget/cost status | always visible or explicitly offline |
| review burden | harmful previews shown to maintainers | zero by default |

## Implementation Shape

- Content classifiers produce policy labels, confidence, and safe reasons, not
  rich descriptions of harmful content.
- Capability checks decide who can import, view, summarize, sync, or delete.
- Quarantine is local-first and does not automatically upload evidence.
- Diagnostics record decision metadata, not raw media.
- User-facing UI explains what was blocked and what options exist.
- Tests include malformed payloads, hostile connectors, replayed blobs,
  oversized imports, and attempts to route blocked content through another app.

## Decomplection Notes

Keep classifiers, policy decisions, quarantine storage, legal escalation,
runtime UI, and sync replication separate. A renderer should not know how to
classify content; a classifier should not decide sharing policy; a sync adapter
should not bypass either.

## Sources

- New Zealand Films, Videos, and Publications Classification Act 1993:
  https://www.legislation.govt.nz/act/public/1993/94/en/latest/
- Scuttlebutt protocol guide:
  https://ssbc.github.io/scuttlebutt-protocol-guide/
