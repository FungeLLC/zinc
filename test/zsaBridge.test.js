/**
 * Tests for the deterministic ZINC-2 -> ZSA (ZIP 226/227) bridge identity.
 * The hashes are cross-checked against an independent BLAKE2b computation so a
 * regression in personalisation/length is caught.
 */

import { blake2b } from '@noble/hashes/blake2.js'
import {
	deriveZsaIssuer,
	buildAssetDesc,
	computeAssetDescHash,
	encodeAssetId,
	computeAssetDigest,
	deriveZsaAssetIdentity,
	ZSA_ASSET_DESC_PERSONAL,
	ZSA_ASSET_DIGEST_PERSONAL,
	ZINC2_ASSET_DESC_PREFIX
} from '../src/zsaBridge.js'

// secp256k1 generator point, compressed — a stable, valid 33-byte key.
const PUBKEY_G = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'
const XONLY_G = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'

const REGISTRY = 'u1registryexampleaddress'
const CID = 'QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR'

const personal = (tag) => new TextEncoder().encode(tag)
const hex = (bytes) => Buffer.from(bytes).toString('hex')

describe('zsaBridge', () => {
	describe('deriveZsaIssuer', () => {
		test('issuer = 0x00 || x-only key', () => {
			const { issuer, xonly } = deriveZsaIssuer(PUBKEY_G)
			expect(xonly).toBe(XONLY_G)
			expect(issuer).toBe(`00${XONLY_G}`)
			expect(issuer).toHaveLength(66)
		})

		test('accepts 02 and 03 prefixes, rejects everything else', () => {
			expect(() => deriveZsaIssuer(`03${XONLY_G}`)).not.toThrow()
			expect(() => deriveZsaIssuer(`04${XONLY_G}`)).toThrow(/start with 02 or 03/)
		})

		test('rejects malformed keys', () => {
			expect(() => deriveZsaIssuer('')).toThrow(/33-byte compressed/)
			expect(() => deriveZsaIssuer('zz')).toThrow(/33-byte compressed/)
			expect(() => deriveZsaIssuer(`02${XONLY_G}ff`)).toThrow(/33-byte compressed/)
		})
	})

	describe('buildAssetDesc', () => {
		test('canonical ZINC-2 form, stripping ipfs:// from the cid', () => {
			expect(buildAssetDesc({ registry: REGISTRY, cid: CID }))
				.toBe(`${ZINC2_ASSET_DESC_PREFIX}|${REGISTRY}|${CID}`)
			expect(buildAssetDesc({ registry: REGISTRY, cid: `ipfs://${CID}` }))
				.toBe(`${ZINC2_ASSET_DESC_PREFIX}|${REGISTRY}|${CID}`)
		})

		test('rejects missing parts and the pipe delimiter', () => {
			expect(() => buildAssetDesc({ registry: '', cid: CID })).toThrow(/registry is required/)
			expect(() => buildAssetDesc({ registry: REGISTRY, cid: '' })).toThrow(/cid is required/)
			expect(() => buildAssetDesc({ registry: 'a|b', cid: CID })).toThrow(/cannot contain '\|'/)
		})
	})

	describe('computeAssetDescHash', () => {
		test('matches an independent BLAKE2b-256 with the ZIP-227 personalisation', () => {
			const assetDesc = buildAssetDesc({ registry: REGISTRY, cid: CID })
			const expected = hex(blake2b(new TextEncoder().encode(assetDesc), {
				dkLen: 32,
				personalization: personal(ZSA_ASSET_DESC_PERSONAL)
			}))
			expect(computeAssetDescHash(assetDesc)).toBe(expected)
			expect(computeAssetDescHash(assetDesc)).toMatch(/^[0-9a-f]{64}$/)
		})

		test('is deterministic and input-sensitive', () => {
			const a = computeAssetDescHash('ZINC-2|r|cidA')
			const b = computeAssetDescHash('ZINC-2|r|cidA')
			const c = computeAssetDescHash('ZINC-2|r|cidB')
			expect(a).toBe(b)
			expect(a).not.toBe(c)
		})

		test('rejects empty input', () => {
			expect(() => computeAssetDescHash('')).toThrow(/non-empty/)
		})
	})

	describe('encodeAssetId', () => {
		test('0x00 || issuer || assetDescHash, 66 bytes', () => {
			const { issuer } = deriveZsaIssuer(PUBKEY_G)
			const descHash = computeAssetDescHash(buildAssetDesc({ registry: REGISTRY, cid: CID }))
			const encoded = encodeAssetId(issuer, descHash)
			expect(encoded).toBe(`00${issuer}${descHash}`.toLowerCase())
			expect(encoded).toHaveLength(132)
		})

		test('validates field lengths', () => {
			expect(() => encodeAssetId('00', 'aa'.repeat(32))).toThrow(/issuer must be 33 bytes/)
			expect(() => encodeAssetId(`00${XONLY_G}`, 'aa')).toThrow(/assetDescHash must be 32 bytes/)
		})
	})

	describe('computeAssetDigest', () => {
		test('matches an independent BLAKE2b-512 with the ZIP-227 personalisation', () => {
			const { issuer } = deriveZsaIssuer(PUBKEY_G)
			const descHash = computeAssetDescHash(buildAssetDesc({ registry: REGISTRY, cid: CID }))
			const encoded = encodeAssetId(issuer, descHash)
			const expected = hex(blake2b(Buffer.from(encoded, 'hex'), {
				dkLen: 64,
				personalization: personal(ZSA_ASSET_DIGEST_PERSONAL)
			}))
			expect(computeAssetDigest(encoded)).toBe(expected)
			expect(computeAssetDigest(encoded)).toMatch(/^[0-9a-f]{128}$/)
		})

		test('rejects a wrong-length encoding', () => {
			expect(() => computeAssetDigest('00ff')).toThrow(/66 bytes/)
		})
	})

	describe('deriveZsaAssetIdentity', () => {
		test('chains the pieces consistently', () => {
			const identity = deriveZsaAssetIdentity({
				creatorPublicKey: PUBKEY_G,
				registry: REGISTRY,
				cid: CID
			})

			const { issuer } = deriveZsaIssuer(PUBKEY_G)
			expect(identity.issuer).toBe(issuer)
			expect(identity.asset_desc).toBe(`${ZINC2_ASSET_DESC_PREFIX}|${REGISTRY}|${CID}`)
			expect(identity.asset_desc_hash).toBe(computeAssetDescHash(identity.asset_desc))
			expect(identity.asset_id_encoded).toBe(encodeAssetId(issuer, identity.asset_desc_hash))
			expect(identity.asset_digest).toBe(computeAssetDigest(identity.asset_id_encoded))
			// AssetBase needs the NU7 proving stack; we never fabricate it.
			expect(identity.asset_base).toBeNull()
		})

		test('different tokens (cid) yield different asset identities', () => {
			const a = deriveZsaAssetIdentity({ creatorPublicKey: PUBKEY_G, registry: REGISTRY, cid: 'QmAaa' })
			const b = deriveZsaAssetIdentity({ creatorPublicKey: PUBKEY_G, registry: REGISTRY, cid: 'QmBbb' })
			expect(a.asset_digest).not.toBe(b.asset_digest)
			expect(a.issuer).toBe(b.issuer)
		})

		test('02/03 of the same X collapse to one BIP-340 issuer (x-only)', () => {
			const a = deriveZsaAssetIdentity({ creatorPublicKey: `02${XONLY_G}`, registry: REGISTRY, cid: CID })
			const b = deriveZsaAssetIdentity({ creatorPublicKey: `03${XONLY_G}`, registry: REGISTRY, cid: CID })
			expect(a.issuer).toBe(b.issuer)
			expect(a.asset_digest).toBe(b.asset_digest)
		})

		test('a different issuer X yields a different asset identity', () => {
			const otherX = 'a1'.repeat(32)
			const a = deriveZsaAssetIdentity({ creatorPublicKey: PUBKEY_G, registry: REGISTRY, cid: CID })
			const b = deriveZsaAssetIdentity({ creatorPublicKey: `02${otherX}`, registry: REGISTRY, cid: CID })
			expect(a.issuer).not.toBe(b.issuer)
			expect(a.asset_digest).not.toBe(b.asset_digest)
		})
	})
})
