/**
 * Tests for the ZINC-2 `nfpt_collection` signing scheme that backs
 * owner-controlled mint price + URL updates and the `final` supply lock.
 */

import {
	buildCanonicalPayload,
	buildCollectionMemoFields,
	verifyCollectionMemoSignature,
	signCollectionUpdate,
	buildAndSign,
	buildSignedCollectionMemo,
	isCollectionFinalFlag,
	COLLECTION_MEMO_TYPE,
	COLLECTION_FINAL_FIELD
} from '../src/collection.js'
import { generatePrivateKey, getPublicKeyFromPrivate } from '../src/crypto.js'

describe('collection', () => {
	const slug = 'privacy-punks'
	const name = 'Privacy Punks'

	let privateKey
	let publicKey

	beforeAll(() => {
		privateKey = generatePrivateKey()
		publicKey = getPublicKeyFromPrivate(privateKey)
	})

	describe('buildCanonicalPayload', () => {
		test('produces a stable canonical string', () => {
			const canonical = buildCanonicalPayload({
				slug,
				name,
				mintPrice: 0.1,
				externalUrl: 'https://example.com/privacy-punks',
				nonce: 1
			})
			expect(canonical).toBe(
				`${COLLECTION_MEMO_TYPE}|${slug}|${name}|0.1|https://example.com/privacy-punks|1`
			)
		})

		test('normalises trailing zeros in the price', () => {
			const a = buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: 0 })
			const b = buildCanonicalPayload({ slug, name, mintPrice: '0.10000000', nonce: 0 })
			expect(a).toBe(b)
		})

		test('rejects pipe characters that would corrupt the canonical form', () => {
			expect(() => buildCanonicalPayload({ slug, name: 'Evil|Name', mintPrice: 0.1, nonce: 0 }))
				.toThrow(/cannot contain '\|'/)
			expect(() => buildCanonicalPayload({ slug, name, mintPrice: 0.1, externalUrl: 'http://bad|url', nonce: 0 }))
				.toThrow(/cannot contain '\|'/)
		})

		test('rejects malformed slugs, prices, and nonces', () => {
			expect(() => buildCanonicalPayload({ slug: 'BAD slug', name, mintPrice: 0.1, nonce: 0 }))
				.toThrow(/Invalid collection slug/)
			expect(() => buildCanonicalPayload({ slug, name, mintPrice: -1, nonce: 0 }))
				.toThrow(/Invalid mint price/)
			expect(() => buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: -3 }))
				.toThrow(/Invalid nonce/)
		})
	})

	describe('signing + verification round-trip', () => {
		test('valid signature passes verification', () => {
			const { canonical, signatureHex } = buildAndSign({
				slug, name, mintPrice: 0.1, externalUrl: '', nonce: 1, privateKeyHex: privateKey
			})
			const fields = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 1,
				creatorPublicKey: publicKey, signatureHex
			})
			const result = verifyCollectionMemoSignature(fields)
			expect(result.valid).toBe(true)
			expect(result.canonical).toBe(canonical)
			expect(result.hash).toMatch(/^[0-9a-f]{64}$/)
		})

		test('buildSignedCollectionMemo assembles a self-verifying memo', () => {
			const { fields, creatorPublicKey } = buildSignedCollectionMemo({
				slug, name, mintPrice: 0.1, nonce: 5, privateKeyHex: privateKey
			})
			expect(creatorPublicKey).toBe(publicKey)
			expect(verifyCollectionMemoSignature(fields).valid).toBe(true)
		})

		test('tampered name fails verification', () => {
			const { signatureHex } = buildAndSign({
				slug, name, mintPrice: 0.1, externalUrl: '', nonce: 1, privateKeyHex: privateKey
			})
			const fields = buildCollectionMemoFields({
				slug, name: 'Different Name', mintPrice: 0.1, nonce: 1,
				creatorPublicKey: publicKey, signatureHex
			})
			const result = verifyCollectionMemoSignature(fields)
			expect(result.valid).toBe(false)
			expect(result.reason).toMatch(/signature mismatch/)
		})

		test('signature from a different key fails verification', () => {
			const otherPrivate = generatePrivateKey()
			const canonical = buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: 1 })
			const wrongSig = signCollectionUpdate(canonical, otherPrivate)
			const fields = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 1,
				creatorPublicKey: publicKey, signatureHex: wrongSig
			})
			expect(verifyCollectionMemoSignature(fields).valid).toBe(false)
		})
	})

	describe('buildCollectionMemoFields', () => {
		test('rejects bad creator and signature lengths', () => {
			expect(() => buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 0,
				creatorPublicKey: '00', signatureHex: 'aa'.repeat(64)
			})).toThrow(/creator_public_key/)
			expect(() => buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 0,
				creatorPublicKey: publicKey, signatureHex: 'aa'
			})).toThrow(/signature/)
		})
	})

	describe('final supply lock (ZSA finalize analogue)', () => {
		test('isCollectionFinalFlag only treats 1/"1"/true as set', () => {
			expect(isCollectionFinalFlag('1')).toBe(true)
			expect(isCollectionFinalFlag(1)).toBe(true)
			expect(isCollectionFinalFlag(true)).toBe(true)
			for (const v of ['0', 0, '', undefined, null, false, '2']) {
				expect(isCollectionFinalFlag(v)).toBe(false)
			}
		})

		test('canonical appends |1 only when final is set (backwards compatible)', () => {
			const base = buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: 1 })
			const finalised = buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: 1, final: true })
			expect(base).toBe(`${COLLECTION_MEMO_TYPE}|${slug}|${name}|0.1||1`)
			expect(finalised).toBe(`${base}|1`)
			expect(buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: 1, final: '0' })).toBe(base)
		})

		test('canonical rejects a malformed final flag', () => {
			expect(() => buildCanonicalPayload({ slug, name, mintPrice: 0.1, nonce: 1, final: '2' }))
				.toThrow(/Invalid final flag/)
		})

		test('memo fields carry final:1 only when set', () => {
			const withFinal = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 1,
				creatorPublicKey: publicKey, signatureHex: 'aa'.repeat(64), final: true
			})
			expect(withFinal[COLLECTION_FINAL_FIELD]).toBe('1')
			const without = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 1,
				creatorPublicKey: publicKey, signatureHex: 'aa'.repeat(64)
			})
			expect(without[COLLECTION_FINAL_FIELD]).toBeUndefined()
		})

		test('a finalised memo round-trips and verifies', () => {
			const { signatureHex } = buildAndSign({
				slug, name, mintPrice: 0.1, externalUrl: '', nonce: 2, privateKeyHex: privateKey, final: true
			})
			const fields = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 2,
				creatorPublicKey: publicKey, signatureHex, final: true
			})
			expect(fields[COLLECTION_FINAL_FIELD]).toBe('1')
			expect(verifyCollectionMemoSignature(fields).valid).toBe(true)
		})

		test('stripping the final flag breaks the signature', () => {
			const { signatureHex } = buildAndSign({
				slug, name, mintPrice: 0.1, externalUrl: '', nonce: 2, privateKeyHex: privateKey, final: true
			})
			const fields = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 2,
				creatorPublicKey: publicKey, signatureHex, final: true
			})
			delete fields[COLLECTION_FINAL_FIELD]
			expect(verifyCollectionMemoSignature(fields).valid).toBe(false)
		})

		test('forging a final flag onto a non-final memo breaks the signature', () => {
			const { signatureHex } = buildAndSign({
				slug, name, mintPrice: 0.1, externalUrl: '', nonce: 2, privateKeyHex: privateKey
			})
			const fields = buildCollectionMemoFields({
				slug, name, mintPrice: 0.1, nonce: 2,
				creatorPublicKey: publicKey, signatureHex
			})
			fields[COLLECTION_FINAL_FIELD] = '1'
			expect(verifyCollectionMemoSignature(fields).valid).toBe(false)
		})
	})
})
