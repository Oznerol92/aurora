# Roadmap — Brain provenance & integrity (targeted: v0.5.1)

> **Status: not started.** This is a design sketch, deliberately deferred. The
> brain + persona subsystem (v0.3.4) ships _without_ any integrity layer. The
> `source` and `hash` fields on brain cards are forward hooks only — nothing
> verifies them yet.

## The problem

Aurora's "brain" is a curated corpus of method knowledge that shapes every
answer. As it grows and is shared, edited, or synced across machines, we want a
way to **prove that what's in the brain is faithful to its original source** —
that a card hasn't been silently altered, corrupted, or tampered with. "Is this
rule still the rule we vetted?" should have a verifiable answer, not a trust-me.

This matters most once the brain is (a) shared between people, (b) synced across
devices, or (c) contributed to by more than one author.

## Why this is deferred, not designed-in now

Integrity only earns its complexity once the brain is multi-writer or
distributed. For a single user on one machine, the on-disk `brain/` cards under
version control already give git history and review. So: build the brain first,
prove it makes a difference, then add provenance when sharing/scale arrives.

## Phase A — cheap local prototype (prove the mechanics)

Goal: tamper-evidence with zero infrastructure, runnable on one laptop.

- **Content hashing.** Each card already carries a `hash` (sha256 of its body).
  Extend to a signed manifest: `brain/MANIFEST.json` mapping `id → {hash, source,
ts}`, itself hashed. A `brain verify` command recomputes every card's hash and
  flags drift from the manifest.
- **A hash chain ("cheap blockchain").** Append-only `brain/ledger.jsonl`, each
  entry `{prevHash, cardId, contentHash, ts, note}` where `prevHash` links to the
  previous entry. Any edit that isn't appended as a new, correctly-chained entry
  is detectable. This is the "cheap blockchain of nodes to test it out" — a local
  Merkle-ish log, no network, no consensus, no tokens.
- **Optional signing.** Sign manifest/ledger heads with a local keypair
  (ed25519) so authorship is attestable. Keys via env/secret, never committed
  (consistent with Aurora's secrets-env-only rule).

Deliverable: `aurora brain verify` returns clean / drifted, and `brain commit`
appends a ledger entry. Enough to demonstrate faithful-to-original detection.

## Phase B — scalable / distributed (later)

When the brain is genuinely shared, graduate from the local log to a real
distributed-integrity layer. Options to evaluate (not yet chosen):

- A small set of **replicating nodes** that each hold the ledger and gossip
  heads, accepting an entry only when its chain validates (lightweight BFT or
  simple quorum). This is the "scalable nodes" path.
- An **existing content-addressed store** (IPFS-style CIDs) so a card's address
  _is_ its hash — faithfulness is intrinsic, tampering changes the address.
- An **anchoring** approach: keep the cheap local ledger, periodically anchor its
  head hash into a public chain or a notarization service for an external,
  timestamped proof — cheapest credible "real blockchain" without running one.

Decision criteria to settle in v0.5.1: number of writers, trust model (do nodes
trust each other?), offline-first requirement, and cost. Pick the lightest
option that meets the actual sharing model — don't over-build consensus for what
may stay a handful of trusted collaborators.

## Open questions

- Granularity: verify whole-corpus, per-card, or per-rule?
- What's the source of truth when a card and its `source:` original diverge —
  is the card _allowed_ to distill, and if so how is "faithful" defined beyond a
  byte hash? (Likely: faithful = "derived under review", recorded in the ledger
  note, not byte-identity.)
- How does persona data (personal, per-user) interact with a shared ledger? Most
  likely it never enters it — provenance is for the shared brain, not the user's
  private voice profile.

## Out of scope for v0.5.1

Smart contracts, tokens, public-chain gas, or any consensus heavier than what the
actual collaborator count justifies.
