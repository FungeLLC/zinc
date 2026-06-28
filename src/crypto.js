/**
 * @fileoverview secp256k1 / SHA-256 primitives for ZINC signatures.
 *
 * ZINC signatures are plain ECDSA over secp256k1 of the SHA-256 of a canonical
 * UTF-8 string, producing a 64-byte compact (r‖s), low-S signature. This is the
 * exact primitive used by the live reference deployment, so signatures are
 * byte-compatible across any conforming implementation.
 */

import crypto from 'node:crypto';
import secp256k1 from 'secp256k1';

/**
 * Generate a new secp256k1 private key.
 * @returns {string} Hex-encoded 32-byte private key.
 */
export const generatePrivateKey = () => {
	let privateKey;
	do {
		privateKey = crypto.randomBytes(32);
	} while (!secp256k1.privateKeyVerify(privateKey));
	return privateKey.toString('hex');
};

/**
 * Derive the compressed public key from a private key.
 * @param {string} privateKeyHex - Hex-encoded private key.
 * @returns {string} Hex-encoded compressed public key (33 bytes / 66 hex chars).
 */
export const getPublicKeyFromPrivate = (privateKeyHex) => {
	if (!privateKeyHex || typeof privateKeyHex !== 'string') {
		throw new Error('Invalid private key format');
	}
	const privateKey = Buffer.from(privateKeyHex, 'hex');
	if (!secp256k1.privateKeyVerify(privateKey)) {
		throw new Error('Invalid private key');
	}
	const publicKey = secp256k1.publicKeyCreate(privateKey, true); // compressed
	return Buffer.from(publicKey).toString('hex');
};

/**
 * Sign a UTF-8 string: ECDSA(secp256k1) over SHA-256(data).
 * @param {string} data - Canonical string to sign.
 * @param {string} privateKeyHex - Hex-encoded private key.
 * @returns {string} Hex-encoded 64-byte compact signature.
 */
export const signData = (data, privateKeyHex) => {
	if (!data || !privateKeyHex) {
		throw new Error('Missing data or private key');
	}
	const privateKey = Buffer.from(privateKeyHex, 'hex');
	if (!secp256k1.privateKeyVerify(privateKey)) {
		throw new Error('Invalid private key');
	}
	const hash = crypto.createHash('sha256').update(data, 'utf8').digest();
	const signature = secp256k1.ecdsaSign(hash, privateKey);
	return Buffer.from(signature.signature).toString('hex');
};

/**
 * Verify a ZINC signature.
 * @param {string} data - Original signed string.
 * @param {string} signatureHex - Hex-encoded 64-byte compact signature.
 * @param {string} publicKeyHex - Hex-encoded compressed public key (33 bytes).
 * @returns {boolean} Whether the signature is valid.
 */
export const verifySignature = (data, signatureHex, publicKeyHex) => {
	try {
		if (!data || !signatureHex || !publicKeyHex) {
			return false;
		}
		const signature = Buffer.from(signatureHex, 'hex');
		const publicKey = Buffer.from(publicKeyHex, 'hex');
		if (signature.length !== 64) return false;
		if (publicKey.length !== 33) return false;
		const hash = crypto.createHash('sha256').update(data, 'utf8').digest();
		return secp256k1.ecdsaVerify(signature, hash, publicKey);
	} catch {
		return false;
	}
};

/**
 * Generate a random hex string.
 * @param {number} length - Length in bytes (default 32).
 * @returns {string} Random hex string.
 */
export const generateRandomHex = (length = 32) => crypto.randomBytes(length).toString('hex');

/**
 * SHA-256 of a string.
 * @param {string} data - Input.
 * @param {string} encoding - Input encoding (default 'utf8').
 * @returns {string} Hex-encoded digest.
 */
export const sha256Hash = (data, encoding = 'utf8') =>
	crypto.createHash('sha256').update(data, encoding).digest('hex');

/**
 * Validate a hex string (optionally of an exact byte length).
 * @param {string} hexString
 * @param {number|null} expectedLength - Expected byte length, or null.
 * @returns {boolean}
 */
export const isValidHex = (hexString, expectedLength = null) => {
	if (!hexString || typeof hexString !== 'string') return false;
	if (!/^[0-9a-fA-F]+$/.test(hexString)) return false;
	if (expectedLength !== null && hexString.length !== expectedLength * 2) return false;
	return true;
};

/**
 * Whether a hex string is a valid secp256k1 private key.
 * @param {string} privateKeyHex
 * @returns {boolean}
 */
export const isValidPrivateKey = (privateKeyHex) => {
	try {
		if (!isValidHex(privateKeyHex, 32)) return false;
		return secp256k1.privateKeyVerify(Buffer.from(privateKeyHex, 'hex'));
	} catch {
		return false;
	}
};

/**
 * Whether a hex string is a valid compressed secp256k1 public key.
 * @param {string} publicKeyHex
 * @returns {boolean}
 */
export const isValidPublicKey = (publicKeyHex) => {
	try {
		if (!isValidHex(publicKeyHex, 33)) return false;
		return secp256k1.publicKeyVerify(Buffer.from(publicKeyHex, 'hex'));
	} catch {
		return false;
	}
};
