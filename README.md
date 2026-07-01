# ZINC — Zcash Inscriptions

**ZINC (Zcash INsCriptions)** is an open, application-layer standard for inscribing
typed, content-addressed data inside Zcash **shielded** transactions, using the
encrypted memo as the carrier. Inscriptions are general; **NFTs are one profile,
DNS zones are another**.

This repository is the **standard + its MIT-licensed reference library**:

| Part | What it is |
| --- | --- |
| **ZINC-1** | The inscription **envelope** — a ZIP-302 text-memo profile (`t:<type>` + `key:value` records, ≤ 512 bytes). |
| **ZINC-2** | The **non-fungible token** profile (the shielded analogue of ERC-721). On-chain tag `t:nfpt` for wire-compatibility. |
| **ZINC-3 "Zones"** | The **shielded DNS zones** profile — anchors complete DNS zones (not vanity names) to on-chain inscriptions. Informative here. |

Runs on the protocol deployed **today** — no consensus change — and is engineered
to **bridge to native Zcash Shielded Assets (ZSA, ZIP 226/227) after NU7**.

- **Specification:** [`spec/zinc-shielded-inscriptions.md`](spec/zinc-shielded-inscriptions.md)
- **Honest ZSA comparison:** [`spec/zinc-vs-zsa.md`](spec/zinc-vs-zsa.md)
- **Companion scanner:** [`FungeLLC/zinc-scanner`](https://github.com/FungeLLC/zinc-scanner) — a stateless Rust Orchard view-only scanner / UFVK utility.
- **Live reference deployment:** <https://secresea.com> (marketplace + indexer; app source private).

## Install

```bash
npm install @fungellc/zinc
```

(The bare `zinc` name on npm belongs to an unrelated package, so the library
ships under the `@fungellc` scope.)

Requires Node.js ≥ 18. Dependencies: [`secp256k1`](https://www.npmjs.com/package/secp256k1)
(ECDSA — the exact primitive the live deployment uses, so signatures are
byte-compatible) and [`@noble/hashes`](https://www.npmjs.com/package/@noble/hashes)
(BLAKE2b for the ZSA bridge).

## Library usage

```js
import {
	createMemo, parseMemo, validateMemo,        // ZINC-1 envelope
	buildSignedCollectionMemo,                  // ZINC-2 signed collection metadata
	deriveZsaAssetIdentity,                     // ZSA (ZIP 226/227) bridge identity
	NFPT_TYPES
} from '@fungellc/zinc'

// ZINC-1: build and parse an inscription envelope (≤ 512 bytes, UTF-8).
const memo = createMemo({ t: NFPT_TYPES.INSCRIPTION, c: 'ipfs://Qm…', n: 'Cat #1' })
const fields = parseMemo(memo)
validateMemo(fields, NFPT_TYPES.INSCRIPTION) // -> true

// ZINC-2: owner-signed collection metadata with an irreversible `final` lock.
const { fields: collectionMemo } = buildSignedCollectionMemo({
	slug: 'privacy-punks', name: 'Privacy Punks', mintPrice: 0.1, nonce: 1,
	privateKeyHex: process.env.OWNER_PRIVATE_KEY, final: true
})

// ZSA bridge: the deterministic AssetId/Digest the same issuer mints post-NU7.
const id = deriveZsaAssetIdentity({
	creatorPublicKey: '02…', registry: 'u1…', cid: 'Qm…'
})
console.log(id.asset_digest)
```

Subpath exports are also available: `@fungellc/zinc/envelope`,
`@fungellc/zinc/collection`, `@fungellc/zinc/crypto`,
`@fungellc/zinc/zsa-bridge`, `@fungellc/zinc/constants`.

## CLI tools

```bash
# Sign an nfpt_collection update offline (key never leaves your machine):
npx zinc-sign-collection --slug privacy-punks --name 'Privacy Punks' \
  --mint-price 0.15 --nonce 1 --private-key <64-hex> [--final] [--post-body]

# Derive a token's deterministic ZSA bridge identity:
npx zinc-zsa-identity --creator-public-key <hex> --registry <u1…> --cid <cid>
```

## Wire format (quick reference)

A ZINC memo is plain UTF-8: newline-separated `key:value` pairs, the first being
`t:<type>`, the whole thing ≤ 512 bytes (Orchard's memo capacity). Lines split on
the **first** colon only.

```
t:nfpt
c:ipfs://QmbWqx…
n:Cat #1
```

Common records: `t` (type, required first), `c` (`ipfs://` content reference),
`rg` (registry), `cr` (issuer pubkey), `sg` (signature). Profiles add their own —
see the spec.

## Interoperability

ZINC signatures are plain **ECDSA over secp256k1 of SHA-256(canonical-string)**,
64-byte compact (r‖s), low-S — RFC 6979 deterministic. Any conforming library
produces byte-identical signatures; memos signed by this library verify against
the live deployment and vice versa.

## Tests

```bash
npm test
```

57 tests cover the envelope (including the parser-differential and
delimiter-injection guards), the collection signing scheme (incl. the `final`
supply lock), the crypto primitives, and the ZSA bridge identity (hashes
cross-checked against an independent BLAKE2b).

## Relationship to ZSA

ZSA (ZIP 226/227) is the consensus-level home for native, note-bound, supply-
audited *assets* (after NU7). ZINC does **not** compete with it — it is the
available-today, any-wallet, general-purpose inscription layer **and** the
content-addressed metadata/registry layer that ZSA itself leaves off-chain. ZINC
already adopts ZSA-aligned conventions (`final` supply lock, x-only issuer key,
deterministic `asset_desc` → `AssetId` bridge). See
[`spec/zinc-vs-zsa.md`](spec/zinc-vs-zsa.md).

## License

[MIT](LICENSE) © FungeLLC
