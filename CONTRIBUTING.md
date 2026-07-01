# Contributing to ZINC

Thanks for your interest in **ZINC** (Zcash INsCriptions). This repository holds
two related things, and how you contribute depends on which one you're touching:

1. **The standard** — the normative specifications in [`spec/`](spec/)
   (`zinc-shielded-inscriptions.md` for ZINC‑1/ZINC‑2/ZINC‑3, and `zinc-vs-zsa.md`
   for the design rationale against Zcash Shielded Assets).
2. **The reference library** — the MIT‑licensed JavaScript implementation in
   [`src/`](src/), its CLIs in [`bin/`](bin/), and its tests in [`test/`](test/).

The live reference deployment is [secresea.com](https://secresea.com); the
companion view‑only scanner lives in
[`FungeLLC/zinc-scanner`](https://github.com/FungeLLC/zinc-scanner).

## Ground rules

- Be civil and constructive. Assume good faith.
- Keep changes focused — one logical change per pull request.
- By contributing you agree your work is licensed under the project's
  [MIT licence](LICENSE), and you certify the
  [Developer Certificate of Origin](https://developercertificate.org/) by
  adding a `Signed-off-by:` line to each commit (`git commit -s`).

## Changing the standard

ZINC is meant to become an interoperable, application‑layer Zcash standard, so
spec changes carry more weight than library tweaks.

- **Open an issue first** describing the problem and the proposed change, before
  writing a large spec PR. Wire‑format changes need discussion.
- **Backwards compatibility is paramount.** The `t:nfpt` / `t:nfpt_*` type tags
  are already inscribed on mainnet. Existing inscriptions MUST keep parsing and
  verifying. Prefer additive records (a new key, or a new `t:` profile) over
  changing existing semantics.
- **Stay within the envelope.** ZINC‑1 is a profile of ZIP‑302 case‑1 (UTF‑8
  text) memos, ≤ 512 bytes. Proposals MUST NOT require a consensus change or
  reduce the anonymity set below an ordinary shielded payment.
- **New profiles** (e.g. messages, files, attestations) should be specified as a
  new `t:` tag building on ZINC‑1, with their own verification rules.
- Material protocol changes are expected to flow upstream as a Zcash Improvement
  Proposal discussion (forum + [`zcash/zips`](https://github.com/zcash/zips)).
  Note that intent in the PR so we can track it.

Whenever you change normative wire behaviour in `spec/`, add or update a matching
test vector in `test/` so the reference library and the prose can't drift apart.

## Changing the library

### Setup

```bash
npm install
npm test          # vitest — all tests must pass
```

### Code style

This repo follows the same conventions as the wider project:

- **Tabs, not spaces.**
- **ES Modules** and modern syntax. No dynamic `import()`.
- **Never** use `export let`, and never export a mutable object or array — pass
  state through function parameters instead.
- **Reuse** existing helpers rather than duplicating logic; keep modules small
  and single‑purpose. If a file approaches ~1500 lines, refactor.
- Replace magic values with named constants (see [`src/constants.js`](src/constants.js)).
- Validate inputs and handle edge cases; throw on misuse rather than failing
  silently.
- No comments that merely restate the code; comment intent, trade‑offs and
  constraints only.

### Cryptography compatibility

Signatures and hashes MUST stay **byte‑identical** with the live deployment:

- ECDSA over **secp256k1** (the `secp256k1` package) for collection signatures.
- **SHA‑256** (Node `crypto`) for content/signature digests.
- **BLAKE2b** (`@noble/hashes`) for the ZSA (ZIP‑227) bridge identity, with the
  exact personalisation strings in [`src/zsaBridge.js`](src/zsaBridge.js).

If you touch any of these, add a known‑answer test — do not change a constant or
encoding without one.

### Tests

- New or changed behaviour needs tests. Put them next to the existing ones in
  `test/` (`vitest`).
- Only mock at true external boundaries; prefer exercising the real functions.
- Run `npm test` and make sure everything is green before opening a PR.

## Commit & PR process

1. Fork and branch from `main`.
2. Make your change with focused, signed‑off commits (`git commit -s`).
3. `npm test` passes locally.
4. Open a PR describing **what** changed and **why**, and call out any
   wire‑format or signature implications explicitly.

## Reporting security issues

Please **do not** open a public issue for vulnerabilities (e.g. a signature
bypass, a parser that accepts a malformed envelope, or a privacy leak). Report
privately via the security contact at [secresea.com](https://secresea.com) and
allow time for a fix before disclosure.

## Licence

ZINC is released under the [MIT licence](LICENSE). Contributions are accepted
under the same terms.
