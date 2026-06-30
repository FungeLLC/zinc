# ZINC vs ZSA — an honest comparison, and why we chose simple

*Companion to [`zinc-shielded-inscriptions.md`](zinc-shielded-inscriptions.md).
Forum-/ZIP-discussion-ready.*

People will (rightly) ask: **"Zcash already has Zcash Shielded Assets (ZSA,
ZIP 226/227), which support NFTs natively — why build memo-based inscriptions
instead?"** This document answers that directly. Short version:

> **ZSA is the better technology for native, ownable, supply-audited *assets*, and
> it is the destination.** ZINC is the **available-today, any-wallet,
> general-purpose inscription layer** — and it is *also the metadata/registry layer
> that ZSA itself depends on*. They are complementary, and ZINC is designed to
> bridge into ZSA when NU7 ships. Choosing the simple, deployable design now is a
> deliberate engineering decision, not ignorance of ZSA.

## What ZSA actually is (from ZIP 226/227)

- A **consensus-level** extension of Orchard. A custom Asset is a *note* carrying
  an `AssetBase`; spending the note **is** the transfer, so Zcash nullifiers give
  **native double-spend protection** and true ownership. NFTs = issue with
  `value = 1` and `finalize = 1`.
- Issuance uses a dedicated **issuance key** (ZIP 32 `purpose 227'`, BIP-340
  Schnorr), separate from spend authority; `AssetId = (issuer, hash(asset_desc))`.
- **Issuance is *transparent*** (ZIP 227, Motivation): the issuer, asset and
  amounts are public, so supply can be audited. Subsequent *transfers* are shielded
  (the asset type is hidden in transfer).
- It needs **NU7** (currently deferred), the **v6 transaction format** (ZIP 230),
  **new proving circuits**, and **ZSA-aware wallets/indexers**.
- It deliberately **does not provide a metadata layer**: only `hash(asset_desc)`
  goes on-chain; wallets "MUST NOT" show `asset_desc` raw and must resolve it via
  "a trusted registry of known assets" / a petname file (ZIP 227, *Hash of the
  asset description*).

## Side-by-side

| Dimension | ZSA (ZIP 226/227) | ZINC (memo inscriptions) |
| --- | --- | --- |
| **Layer** | Consensus (protocol change) | Application (ZIP 302 memo profile) |
| **Available** | After **NU7** (deferred) | **Today**, on deployed Orchard/Sapling |
| **Wallet support** | Needs ZSA-aware wallets | Any **memo-capable** wallet (Zashi/Ywallet/Zingo/Winbit32) |
| **Mint/issue privacy** | **Transparent** (public supply) | **Shielded** (encrypted memo; viewing-key only) |
| **Transfer privacy** | Shielded; **asset type hidden** | Shielded; direct-to-recipient hides it from the registry |
| **Ownership / double-spend** | **Native** (note-bound, nullifiers) | **Advisory** today → reveal-once → note-bound/ZSA |
| **Supply auditability** | **Strong** (global issuance state, `finalize`) | Weak (registry/indexer convention; optional `final`) |
| **Metadata** | **None** (hash + off-chain lookup required) | **Rich, content-addressed** (IPFS) — the layer ZSA needs |
| **Scope** | **Assets only** (fungible + NFT) | **General**: NFTs, names (ZINS), messages, files, attestations |
| **Complexity / risk** | New circuit, hard fork, audits | No consensus change; cheap to implement & audit |
| **Bridging out** | Native burn-to-bridge | Via ZSA once NU7 lands (by construction) |

## Where ZSA is simply better

1. **Real ownership & double-spend protection.** This is the one place ZINC's
   launch model is weakest (advisory). ZSA gets it for free from nullifiers.
2. **Auditable supply** with cryptographic finalisation.
3. **Asset-type privacy in transit** (which asset moved is hidden).
4. **Issuer authority** cleanly separated from spend authority (delegation,
   multisig-ready).

If your need is "a serious, fungible-or-NFT *asset* with provable supply and native
custody", **ZSA is the right tool** — and ZINC's job is to get you there, not to
replace it.

## Where ZINC is better — or simply the only option today

1. **It works now.** NU7 is deferred; ZSA NFTs cannot be minted on mainnet yet.
   ZINC has live, on-chain-verifiable mints and transfers today.
2. **It works in wallets people already have.** No new circuit/wallet needed —
   inscriptions are human-readable ZIP-302 memos.
3. **More private at mint.** ZSA issuance is transparent by design; a ZINC mint is
   a shielded memo. For privacy-maximalist drops, that matters.
4. **Rich metadata that ZSA lacks.** ZSA explicitly punts metadata to an off-chain
   "trusted registry"/petname layer. ZINC *is* that layer (registry + IPFS), so it
   stays useful even after ZSA ships.
5. **General-purpose.** Names (ZINS), messages, file inscriptions and attestations
   are out of scope for ZSA but natural for ZINC.
6. **Low risk / low cost.** No hard fork, no proving-system work, easy to audit.

## Why "choose simple" is the smart call here

- **Time-to-value:** the ecosystem gets shielded NFTs + a shared inscription
  standard *now*, instead of waiting on a deferred network upgrade.
- **Reach:** every memo wallet is already a ZINC reader; adoption cost ≈ zero.
- **Optionality:** ZINC is a thin, content-addressed convention. If it's "wrong",
  little is lost; if ZSA slips further, ZINC keeps delivering.
- **Composability:** ZINC fills ZSA's metadata/registry gap, so the "simple" layer
  is *durably* useful, not a stopgap that ZSA deletes.

## What ZINC adopts from ZSA

Reading ZIP 227 surfaced concrete, low-risk improvements. These are
**implemented** — the standard-level pieces in this reference library, the
deployment-level enforcement in the live marketplace:

1. **`final` supply lock** — mirrors ZSA's `finalize`: an irreversible, *signed*
   collection record (`final:1`) that closes supply (e.g. "1024 Privacy Punks,
   locked"), making the cap cryptographically credible pre-NU7 and 1:1 with ZSA
   finalisation. *Implemented (library):* the flag is folded into the signed
   `nfpt_collection` canonical payload in [`../src/collection.js`](../src/collection.js)
   so stripping or forging it breaks the signature. *Implemented (deployment):* an
   irreversible latch on ingest and enforcement on every mint path.
2. **ZSA-aligned issuer key** — the collection owner key *is* the issuer key. Its
   x-only form (the 32-byte X coordinate of the compressed secp256k1 key) is
   exactly the BIP-340 key ZSA issuance uses, so the *same key* can later issue the
   matching ZSA asset. *Implemented:* `deriveZsaIssuer()` in
   [`../src/zsaBridge.js`](../src/zsaBridge.js).
3. **Bridge-by-construction identity** — canonical `asset_desc = "ZINC-2|<registry>|<cid>"`,
   so post-NU7 the ZSA `AssetId`/`AssetDigest` are deterministic from the original
   inscription. *Implemented:* `deriveZsaAssetIdentity()` in
   [`../src/zsaBridge.js`](../src/zsaBridge.js) (+ the `zinc-zsa-identity` CLI),
   with hashes cross-checked against an independent BLAKE2b in the test suite.
4. **Target ZSA as "Model C".** The roadmap's note-bound NFT (Model C) is exactly
   what OrchardZSA already does, so ZSA **is** the note-bound endgame rather than a
   bespoke note-binding (lands with NU7).

## Migration / bridge plan (today → NU7)

```
Phase A (now)        ZINC-2 advisory ownership; shielded mint; IPFS metadata; `final` lock.
Phase B (pre-NU7)    Reveal-once witness: unlinkable double-spend protection without
                     leaking the transfer graph; still any-wallet.
Phase C (post-NU7)   Issue/upgrade tokens as ZSA assets (note-bound, native custody).
                     ZINC remains the inscription + metadata + known-asset registry
                     layer that ZSA wallets rely on. Holders get an upgrade path,
                     not a rug-pull.
```

## Bottom line

ZINC does not out-engineer ZSA. **ZSA is the destination for native assets; ZINC
is the road that's open today, the general inscription layer ZSA doesn't cover, and
the metadata/registry layer ZSA needs.** Choosing the simple, deployable design —
and explicitly engineering the bridge into ZSA — is a deliberate engineering
decision.
