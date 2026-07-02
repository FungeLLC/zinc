<!--
ZINC ("Zcash INsCriptions") is the WORKING DESIGNATION for this family of
application-layer standards. It is intended to be submitted into the official
zcash/zips process, where the ZIP editors assign formal ZIP number(s). "ZINC-1",
"ZINC-2", "ZINC-3" etc. are self-describing codenames for the parts of the family,
not a claim to a parallel official Zcash series. Written in the zcash/zips house
style so it can be opened as a Discussion / Pull Request at
https://github.com/zcash/zips when ready.

Relationship to other Zcash work (so the names don't confuse reviewers):
  ZSA  (ZIP 226/227) = CONSENSUS-level shielded *Assets* (lands with NU7).
                       Native ownership; TRANSPARENT issuance; no metadata layer.
  ZINC (this doc)    = APPLICATION-level shielded *Inscriptions* on the protocol
                       deployed *today*. Shielded mint; rich IPFS metadata;
                       general-purpose (assets, names, messages, files).
  They COMPOSE: see "Relationship to ZSA" and zinc-vs-zsa.md.
-->

# ZINC — Zcash Inscriptions

A family of application-layer standards for inscribing typed, content-addressed
data inside Zcash shielded transactions, using the encrypted memo as the carrier.
Inscriptions are general; **non-fungible tokens are one profile of them, names are
another**.

```
Family: ZINC (Zcash INsCriptions)  [working designation; ZIP number(s) assigned on submission to zcash/zips]
Parts:
  ZINC-1  Inscription Envelope          (general-purpose base layer)
  ZINC-2  Non-Fungible Token profile    (the Zcash-native analogue of ERC-721)
  ZINC-3  Shielded DNS Zones profile    ("ZINC Zones") — informative here
Owners: FungeLLC <https://github.com/FungeLLC>
Status: Pre-Proposal / Draft
Category: Standards / Applications / Wallet
Created: 2026-06-28
License: MIT
Discussions-To: <to be opened on https://github.com/zcash/zips/issues>
Reference-Implementation: <https://github.com/FungeLLC/zinc> (library + CLIs); live: <https://secresea.com>
```

## Terminology

The key words "MUST", "MUST NOT", "SHOULD", "SHOULD NOT", "MAY" and "RECOMMENDED"
are to be interpreted as described in BCP 14 (RFC 2119 and RFC 8174) when, and
only when, they appear in all capitals.

- **Inscription**: a shielded Zcash transaction whose encrypted memo declares a
  typed payload by reference to (or inclusion of) content.
- **Envelope (ZINC-1)**: the shared memo format that carries every inscription.
- **Profile**: a concrete inscription type built on the envelope (ZINC-2 NFTs,
  ZINC-3 DNS zones, …).
- **Registry**: a Zcash address (Unified Address or shielded address) plus its
  Unified Full Viewing Key (UFVK), used as the public *inbox* for inscriptions of
  a given application or collection.
- **CID**: an IPFS Content Identifier (CIDv0/CIDv1) addressing a content document.

---

# ZINC-1 — Inscription Envelope

## Abstract

ZINC-1 defines a compact, human-readable envelope for inscribing typed data inside
Zcash shielded transactions. It is a *profile of ZIP 302 text memos*: every
inscription is an ordinary, wallet-renderable UTF-8 memo of at most 512 bytes,
carrying a `type` tag plus typed records. It is the privacy-preserving analogue of
Bitcoin Ordinals/Inscriptions, but the payload and its association are shielded by
default. ZINC-1 needs **no consensus change** — it runs on the deployed
Orchard/Sapling protocol today.

## Motivation

Zcash has world-class shielded payments but no shared convention for carrying
*typed application data* privately on-chain. Builders who want names, messages,
collectibles, receipts or arbitrary attestations each reinvent an ad-hoc memo
format, with no interoperability and no shared tooling. ZINC-1 gives the ecosystem
one documented envelope that any profile can build on, so tooling (parsers,
scanners, wallets) is written once and reused.

## Requirements

A conforming implementation:

1. MUST carry the inscription as a **ZIP 302 case-1 (UTF-8 text)** memo,
   `<= 512` bytes, leading byte value `<= 0xF4`, padded with trailing `0x00`.
2. MUST begin the body with a `t:<type>` record identifying the profile.
3. MUST address any large/rich payload by content (IPFS CID) rather than inline,
   unless the payload fits the envelope and a profile defines inline carriage.
4. MUST NOT require a transparent output or otherwise reduce the anonymity set
   below that of an ordinary shielded payment.
5. SHOULD remain human-readable so non-aware wallets render it gracefully.

## Specification

### Container

The memo body is newline-separated (`\n`, `0x0A`) records. Each record is
`key:value`, split on the **first** colon only. Keys are lower-case ASCII +
underscore. Values MUST NOT contain `\n`. A key MUST NOT appear more than once;
parsers MUST reject a memo with duplicate keys (see Security Considerations).
The 512-byte limit is measured in UTF-8 **bytes**. Rich/multi-line content
lives in the referenced content document, never in the memo.

```
field    = key ":" value
key      = 1*( %x61-7A / "_" )           ; lower-case ascii + underscore
value    = *( %x20-7E without LF )        ; printable, no newline
memo     = "t:" type *( LF field )        ; <= 512 bytes total, UTF-8
```

### Common records

| Key  | Meaning                                                              |
| ---- | ------------------------------------------------------------------- |
| `t`  | **Type tag** (required, first record) — selects the profile.        |
| `c`  | Content reference — an `ipfs://<cid>` URI to the payload document.   |
| `rg` | Registry address the inscription is addressed to (optional echo).   |
| `cr` | Creator / issuer public key (optional; see Forward-compatibility).  |
| `sg` | Signature over a profile-defined message (optional).                |

Profiles define additional records and the exact semantics of `c`/`cr`/`sg`.

### Verification (envelope level)

1. Trial-decrypt the registry inbox with its UFVK (Orchard/Sapling).
2. Parse the memo body; read `t:` to dispatch to the profile parser.
3. If `c` is present, fetch the document and confirm its CID matches (integrity).
4. Hand off to the profile for type-specific validation and ownership rules.

## Rationale

- **Why ZIP 302 case-1 text?** Existing wallets render it; users never see opaque
  binary; the format is trivially debuggable and auditable.
- **Why content addressing?** Tamper-evidence with no transparent on-chain
  commitment — the CID *is* the integrity proof. (ZSA notably leaves metadata to
  exactly this kind of off-chain, looked-up layer — see Relationship to ZSA.)
- **Why a generic envelope + profiles?** So one set of tooling serves many
  use-cases, and new inscription types are additive (a new `t:` tag), not a fork.

---

# ZINC-2 — Non-Fungible Token profile

## Abstract

ZINC-2 is the NFT profile of ZINC-1: it represents, transfers and verifies
non-fungible tokens entirely inside shielded transactions. It is the
privacy-preserving analogue of Ethereum's **ERC-721** — but the owner, the
transfer trail, the price and the metadata pointer are visible only to holders of
the relevant viewing keys, and (unlike ZSA) the **mint itself is shielded**. It is
designed to **bridge to native ZSA issuance (ZIP 226/227) after NU7** — see
Relationship to ZSA.

> **Wire-compatibility note.** The on-chain type tag for this profile is
> `t:nfpt` (and `t:nfpt_*` for its operations). That tag is already inscribed on
> mainnet tokens, so it is **retained for backwards compatibility**; "ZINC-2" is
> the standard's name for the profile, "NFPT" is the legacy/product label for an
> individual asset.

## Operations

### inscribe (mint) — `t:nfpt`

A shielded payment **to the registry address** declaring the token.

```
t:nfpt
c:ipfs://<cid>
col:<collection-slug>      ; optional
n:<name>                   ; optional, <= 50 chars
d:<description>            ; optional, <= 20 chars (long text -> metadata doc)
f:<data-format>            ; optional: base64 | hex | utf8
rg:<registry-address>      ; optional
```

- `c` MUST be present and MUST be an `ipfs://` URI to the JSON metadata.
- `cr`/`sg` are OPTIONAL authenticity fields signing `c|f|n|d|ts`. Genuine
  mainnet mints are typically **unsigned** — authenticity derives from the
  registry inbox plus content addressing, not from `sg`. (For ZSA-aligned issuer
  authority, see Forward-compatibility.)
- The token's stable identity is `(registry, cid)`; its provenance anchor is the
  inscription transaction id (txid).

### transfer — `t:nfpt_transfer`

A shielded payment **direct to the recipient** (not the registry), so the
transfer is invisible to the registry/scanner — maximal privacy.

```
t:nfpt_transfer
c:ipfs://<cid>
i:<mint-txid>              ; provenance: the inscription this transfers
```

### list / purchase — `t:nfpt_list`, `t:nfpt_purchase_transfer`

```
t:nfpt_list               ; seller -> listings inbox; price/CID may be sealed
r:<tag>                   ; optional pointer to off-chain X25519+AES-256-GCM payload

t:nfpt_purchase_transfer  ; the buy IS the transfer (buyer -> seller, single tx)
c:ipfs://<cid>
i:<mint-txid>
```

### collection metadata — `t:nfpt_collection` (owner-controlled, signed)

```
t:nfpt_collection
s:<slug>
n:<name>
mp:<mint-price>
url:<external-url>        ; optional
final:<0|1>              ; OPTIONAL, irreversible supply lock (ZSA-aligned; see below)
nce:<monotonic-int>
cr:<owner-pubkey>
sg:<signature>
```

The canonical signed payload is
`nfpt_collection|<slug>|<name>|<mint_price>|<external_url>|<nonce>` (plus a
trailing `|1` when finalised). The authoritative collection state is the most
recent validly-signed memo with the highest monotonic `nce`. Indexers cache it;
they do not own it.

### fee / royalty — `t:nfpt_fee`, `t:nfpt_royalty`

```
t:nfpt_fee                t:nfpt_royalty
c:ipfs://<cid>            c:ipfs://<cid>
```

## Metadata document

The `c` CID MUST resolve to a JSON document compatible with the de-facto ERC-721
metadata schema, so existing NFT renderers/trait-indexers can consume it once the
CID is resolved:

```json
{
  "name": "ArtNFPT",
  "description": "Line 1\nLine 2",
  "image": "ipfs://Qm.../image.png",
  "attributes": [{ "trait_type": "Colour", "value": "Blue" }],
  "external_url": "https://example.com/nfpt/Qm...",
  "data_format": "base64"
}
```

## Verification & ownership

1. Resolve via ZINC-1 (registry UFVK scan; earliest height wins for a
   `(registry, cid)` collision).
2. If `cr`/`sg` present, verify the signature.
3. Confirm the IPFS document's CID matches `c`.
4. **Ownership (launch model = advisory):** the latest `nfpt_transfer` /
   `nfpt_purchase_transfer` observed by a viewer with the relevant key, anchored
   to `i:<mint-txid>`. See Security Considerations + Relationship to ZSA for the
   trustless upgrades (reveal-once witness → note-binding ≡ ZSA).

## Security and Privacy Considerations

- **Double-spend / ownership.** A memo is a *label*, not a note-bound token: Zcash
  nullifiers protect the ZEC, not the NFT. The launch model is therefore
  **advisory** (trust-the-poster; txid existence checked; no sender-ownership
  proof), and ZINC-2 requires implementations to disclose this plainly. Two
  trustless upgrades are specified as future work:
  - **Reveal-once witness** — an ownership secret in the private transfer memo;
    transferring reveals the prior secret (proving current ownership) and commits
    the next. A registry sees only opaque, *unlinkable* reveal-once tokens →
    double-spend protection **without** leaking the transfer graph; works from any
    wallet.
  - **Note-bound NFT (Model C) ≡ ZSA.** Binding the token to an Orchard note so
    spending it *is* the transfer is precisely what OrchardZSA does at the
    consensus layer. Rather than reinvent note-binding, **target ZSA as Model C**
    once NU7 ships (see Relationship to ZSA).
- **Transfer-graph leakage.** A naive "registry witnesses every transfer" design
  is rejected: it leaks a pseudonymous owner→owner graph that de-anonymises on
  first listing. Direct-to-recipient transfers are mandated for the privacy path.
- **Listings privacy.** Listings SHOULD use a dedicated ZIP 32 sub-account inbox
  and MAY seal price/CID with X25519 + AES-256-GCM off-chain.
- **Marketplace payment routing.** Where an indexer exposes a "prepare purchase"
  service that tells buyers where to send ZEC, the payout address MUST be pinned
  when the listing is recorded (after whatever owner check the indexer applies)
  and MUST NOT track later ownership-claim updates — otherwise a fabricated
  transfer claim redirects buyer funds. Recording a transfer for a listed token
  MUST void the listing.
- **Parser strictness (parser differentials).** Conforming parsers MUST reject a
  memo containing duplicate keys, and writers MUST emit keys matching
  `[a-z][a-z0-9_]*` only. Two parsers disagreeing on which duplicate "wins"
  (first vs last) can be steered to read different prices or CIDs out of the
  same memo. The 512-byte limit is measured in **UTF-8 bytes**, not UTF-16 code
  units — a subtle bug class in JavaScript implementations.
- **Signature scope and delimiter injection.** The optional inscription
  signature `sg` binds `c|f|n|d[|ts]` only. It therefore asserts **content
  authorship**, not context: it does not bind the type tag, the registry or the
  collection, so a valid `sg` can be replayed in a different context. Verifiers
  MUST NOT infer registry/collection endorsement from `sg` alone. Because the
  canonical string is pipe-delimited, signers and verifiers MUST reject a
  literal `|` inside any signed field (otherwise two different payloads can
  share one signature). A future signed-payload revision SHOULD add a domain
  tag and bind `t` + registry.
- **Collection-update replay.** The `nfpt_collection` canonical payload binds
  the slug and a monotonic `nce`, but not the registry inbox; the same signed
  update is valid at any registry that trusts the same `cr`. Indexers SHOULD
  scope collection state per registry and always apply the highest-`nce` rule
  within that scope.
- **Registry inbox is a public mailbox.** Anyone can send an inscription to a
  published registry address (that is the point), so indexers MUST treat inbox
  contents as untrusted input: enforce first-inscription-wins for a
  `(registry, cid)` collision, apply size/rate limits, and never execute or
  trust fetched metadata.
- **IPFS fetch hygiene.** Metadata documents are attacker-supplied input.
  Fetchers SHOULD cap document size, apply timeouts, validate the document
  against the expected schema, treat embedded URLs as untrusted, and verify the
  fetched bytes hash to the CID (the CID is the integrity proof — use it).
- **Metadata availability.** IPFS content MUST be pinned; loss of pinning yields
  an unresolvable (but still provably-inscribed) token.

---

# Relationship to ZSA (ZIP 226/227), and migration path

ZSA (OrchardZSA) is the **consensus-level** way to have shielded *assets* on
Zcash: assets are notes, so spending one *is* the transfer and Zcash nullifiers
give native double-spend protection. It is the correct long-term home for
*ownable, supply-audited assets*. ZINC does **not** compete with it; the two
**compose**. A full, honest side-by-side is in
[`zinc-vs-zsa.md`](zinc-vs-zsa.md); the essentials:

- **ZSA needs NU7** (deferred) + v6 transactions + new circuits + ZSA-aware
  wallets. **ZINC runs on the deployed protocol today**, in any memo-capable
  wallet.
- **ZSA issuance is transparent** (ZIP 227: public issuer + asset + amount, for
  supply auditing). **ZINC mints are shielded** (encrypted memo; private to
  viewing-key holders). Different privacy/auditability trade-offs.
- **ZSA deliberately has no metadata layer**: it stores only `hash(asset_desc)`
  on-chain and requires wallets to look the asset up via "a trusted registry of
  known assets" / petname files (ZIP 227 §Hash of the asset description). **ZINC's
  registry + content-addressed IPFS metadata is exactly that missing layer** — and
  remains useful *even alongside* ZSA.
- **ZSA is assets-only. ZINC is general** (NFTs, DNS zones, messages, files,
  attestations).

## Forward-compatibility: design ZINC to bridge into ZSA

To make a post-NU7 migration clean, ZINC adopts ZSA-aligned conventions:

1. **Issuer key (optional, ZSA-aligned).** A collection MAY publish an issuer
   public key in `cr` and sign collection/inscription state with it. Aligning this
   with ZSA's issuance key (BIP-340 Schnorr over secp256k1, ZIP 32 path
   `purpose 227'`) lets the same key later issue the matching ZSA asset.
2. **`final` supply lock.** The `final:1` collection record mirrors ZSA's
   `finalize` boolean — an irreversible commitment that supply is closed (e.g.
   "1024 Privacy Punks, locked"), so the cap is cryptographically credible
   pre-NU7 and maps 1:1 onto ZSA finalisation.
3. **Bridge-by-construction identity.** A ZINC-2 token's canonical asset
   description is `asset_desc = "ZINC-2|<registry>|<cid>"` (its stable
   `(registry, cid)` identity). Post-NU7, issuing the ZSA asset with that
   `asset_desc` yields a deterministic identity per ZIP 227:
   `assetDescHash = BLAKE2b-256("ZSA-AssetDescCRH", asset_desc)`,
   `AssetId = (issuer, assetDescHash)`,
   `AssetDigest = BLAKE2b-512("ZSA-Asset-Digest", 0x00 ‖ issuer ‖ assetDescHash)`.
   (`AssetBase = GroupHash^P("z.cash:OrchardZSA", AssetDigest)` is produced inside
   the NU7 issuance circuit.) The ZINC inscription becomes the provenance record,
   the ZSA asset becomes the native carrier, and ZINC's IPFS metadata serves as
   the "known-asset registry" ZSA wallets need.

This makes the endgame explicit: **ZINC today → reveal-once witness → ZSA-backed
(note-bound) tokens after NU7**, with ZINC remaining the inscription + metadata +
registry layer throughout.

> **Reference-implementation status.** Items 1–3 are implemented in this
> repository: the `final` supply lock is folded into the signed `nfpt_collection`
> canonical payload (`src/collection.js`); the deterministic ZSA identity is
> computed by `src/zsaBridge.js` (run `zinc-zsa-identity` to derive any token's
> `AssetId`/Digest). The note-bound model (item 4) is ZSA itself and lands with
> NU7.

---

## Other profiles (informative)

ZINC-1 is deliberately broader than NFTs. Further profiles (each a new `t:` tag):

- **ZINC Zones — Shielded DNS Zones (ZINC-3).** Anchors *complete DNS zones* to
  shielded inscriptions: a domain publishes a `_zinc.<domain>` TXT record whose
  hash commitment is verified against an on-chain `t:zone` (or `t:zone_nfpt`)
  memo, giving the zone a censorship-resistant, privately-updatable source of
  truth. This is infrastructure for decentralised, private *proper DNS* —
  resolution of real domains with full record sets — **not** a vanity-name
  registry. (It is unrelated to "ZNS" by ZcashNames, which maps human-readable
  names to Zcash addresses. Zones bound before the ZINC naming used
  `_zns.<domain>` TXT records and `zns_zone` / `zns_nfpt` memos; resolvers
  keep accepting those legacy tags because inscribed memos are immutable.)
- **Messages / notices** — typed memos beyond free-text payments.
- **File inscriptions** — arbitrary content-addressed documents, chunked across
  multiple memos when larger than 512 bytes.
- **Attestations / receipts** — signed, content-addressed claims.

Only ZINC-1 and ZINC-2 are specified normatively here; ZINC-3 and the rest are
listed to show the envelope's range.

## Reference Implementation

This standard ships with an MIT-licensed reference implementation:

- **`zinc`** (this repository, <https://github.com/FungeLLC/zinc>) — the envelope
  parser/validator, the `nfpt_collection` signing scheme (incl. the `final`
  supply lock) and the deterministic ZSA bridge, plus the `zinc-sign-collection`
  and `zinc-zsa-identity` CLIs.
- **`zinc-scanner`** (<https://github.com/FungeLLC/zinc-scanner>) — a stateless
  Rust Orchard **view-only** scanner / UFVK utility for running alongside a Zcash
  node + lightwalletd.
- A live deployment at <https://secresea.com> (API <https://api.secresea.com>);
  the full marketplace source is private.
- Live mainnet examples (verifiable on-chain):
  - Mint `b91d1e892114d2ec615dadcc7998234aedb2c20f547984b76f8e4618a048711c`
    and transfer `77c6f083e4185aa08ca052987da0508f0fb07fe1719488abfd85c960e3ae6c6d`
    (Black Cat #4872).
  - Earlier Privacy Punk #0: mint `b41392af…`, transfer `f9ee79aa…`.

## References

- ZIP 302 — Standardized Memo Field Format: <https://zips.z.cash/zip-0302>
- ZIP 321 — Payment Request URIs: <https://zips.z.cash/zip-0321>
- ZIP 316 — Unified Addresses and Unified Viewing Keys: <https://zips.z.cash/zip-0316>
- ZIP 32 — Shielded Hierarchical Deterministic Wallets: <https://zips.z.cash/zip-0032>
- ZIP 226 — Transfer and Burn of Zcash Shielded Assets: <https://zips.z.cash/zip-0226>
- ZIP 227 — Issuance of Zcash Shielded Assets: <https://zips.z.cash/zip-0227>
- ERC-721 — Non-Fungible Token Standard: <https://eips.ethereum.org/EIPS/eip-721>
