/**
 * Tests for the secp256k1 / SHA-256 signing primitives.
 */

import {
	generatePrivateKey,
	getPublicKeyFromPrivate,
	signData,
	verifySignature,
	sha256Hash,
	isValidHex,
	isValidPrivateKey,
	isValidPublicKey
} from '../src/crypto.js'

describe('crypto', () => {
	let priv
	let pub

	beforeAll(() => {
		priv = generatePrivateKey()
		pub = getPublicKeyFromPrivate(priv)
	})

	test('generates a 32-byte key and a 33-byte compressed pubkey', () => {
		expect(priv).toMatch(/^[0-9a-f]{64}$/)
		expect(pub).toMatch(/^0[23][0-9a-f]{64}$/)
		expect(isValidPrivateKey(priv)).toBe(true)
		expect(isValidPublicKey(pub)).toBe(true)
	})

	test('sha256 known-answer (NIST "abc")', () => {
		expect(sha256Hash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
	})

	test('sign -> verify round-trips and is deterministic (RFC 6979)', () => {
		const msg = 'nfpt_collection|privacy-punks|Privacy Punks|0.1||1'
		const sigA = signData(msg, priv)
		const sigB = signData(msg, priv)
		expect(sigA).toBe(sigB) // deterministic
		expect(sigA).toMatch(/^[0-9a-f]{128}$/) // 64-byte compact
		expect(verifySignature(msg, sigA, pub)).toBe(true)
	})

	test('verification fails on tamper or wrong key', () => {
		const sig = signData('hello', priv)
		expect(verifySignature('hell0', sig, pub)).toBe(false)
		const otherPub = getPublicKeyFromPrivate(generatePrivateKey())
		expect(verifySignature('hello', sig, otherPub)).toBe(false)
	})

	test('isValidHex length checks', () => {
		expect(isValidHex('00ff')).toBe(true)
		expect(isValidHex('zz')).toBe(false)
		expect(isValidHex('')).toBe(false)
		expect(isValidHex('aa'.repeat(32), 32)).toBe(true)
		expect(isValidHex('aa', 32)).toBe(false)
	})
})
