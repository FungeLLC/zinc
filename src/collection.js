/**
 * @fileoverview ZINC-2 collection metadata signing (`nfpt_collection`).
 *
 * On-chain collection metadata (mint price, external URL, name, …) lives in
 * `t:nfpt_collection` memos signed by the collection owner's secp256k1 key. An
 * indexer's cache is just a projection of the most recent validly-signed memo
 * with the highest monotonic nonce; the chain is authoritative.
 *
 * Canonical signing format (single line, fields joined with `|`):
 *
 *   nfpt_collection|<slug>|<name>|<mint_price>|<external_url>|<nonce>
 *   nfpt_collection|<slug>|<name>|<mint_price>|<external_url>|<nonce>|1   (finalised)
 *
 * - `final` is an OPTIONAL, irreversible supply lock mirroring ZIP 227's
 *   `finalize`. When set, a trailing `|1` is appended (and a `final:1` field
 *   rides in the memo). It is omitted entirely when not set, so pre-final
 *   (6-field) signatures keep verifying unchanged.
 *
 * The signed message is SHA-256(canonical), signed with ECDSA(secp256k1).
 */

import {
	getPublicKeyFromPrivate,
	signData,
	verifySignature,
	sha256Hash
} from './crypto.js';

export const COLLECTION_MEMO_TYPE = 'nfpt_collection';

// On-chain memo key carrying the irreversible supply-finalisation flag.
export const COLLECTION_FINAL_FIELD = 'final';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/**
 * Whether a value represents the "supply finalised" flag. Only `1`/`'1'`/`true`
 * count as set.
 * @param {*} value
 * @returns {boolean}
 */
export const isCollectionFinalFlag = (value) =>
	value === '1' || value === 1 || value === true;

// Values that unambiguously mean "not finalised". Anything outside this set
// (and not a recognised truthy flag) is malformed and rejected, so a stray
// `final:2` can never silently change signing/verification behaviour.
const FINAL_FALSEY = new Set([undefined, null, '', '0', 0, false]);

const coerceFinalFlag = (value) => {
	if (isCollectionFinalFlag(value)) return true;
	if (FINAL_FALSEY.has(value)) return false;
	throw new Error(`Invalid final flag: ${value}`);
};

/**
 * Build the canonical signing payload for a collection update memo.
 * @param {object} fields
 * @param {string} fields.slug
 * @param {string} fields.name
 * @param {number|string} fields.mintPrice
 * @param {string} [fields.externalUrl='']
 * @param {number|string} fields.nonce
 * @param {boolean|string|number} [fields.final=false]
 * @returns {string}
 */
export const buildCanonicalPayload = ({ slug, name, mintPrice, externalUrl = '', nonce, final = false }) => {
	if (!slug || !SLUG_PATTERN.test(slug)) {
		throw new Error(`Invalid collection slug: ${slug}`);
	}
	if (!name || typeof name !== 'string') {
		throw new Error('Collection name is required');
	}
	const priceNum = Number(mintPrice);
	if (!Number.isFinite(priceNum) || priceNum <= 0) {
		throw new Error(`Invalid mint price: ${mintPrice}`);
	}
	const nonceInt = Number(nonce);
	if (!Number.isInteger(nonceInt) || nonceInt < 0) {
		throw new Error(`Invalid nonce: ${nonce}`);
	}
	if (externalUrl && externalUrl.includes('|')) {
		throw new Error("external_url cannot contain '|' (canonical delimiter)");
	}
	if (name.includes('|')) {
		throw new Error("name cannot contain '|' (canonical delimiter)");
	}

	// Normalise the price to a stable decimal string so 0.1 and 0.10 produce
	// identical canonical payloads regardless of where they were parsed.
	const priceStr = String(Number(priceNum.toFixed(8)));

	const base = `${COLLECTION_MEMO_TYPE}|${slug}|${name}|${priceStr}|${externalUrl}|${nonceInt}`;
	return coerceFinalFlag(final) ? `${base}|1` : base;
};

/**
 * Build the on-chain memo fields for an `nfpt_collection` update.
 * @returns {object} Field map suitable for `createMemo`.
 */
export const buildCollectionMemoFields = ({
	slug,
	name,
	mintPrice,
	externalUrl,
	nonce,
	creatorPublicKey,
	signatureHex,
	description,
	timestamp,
	final = false
}) => {
	if (!creatorPublicKey || !/^[0-9a-fA-F]{66}$/.test(creatorPublicKey)) {
		throw new Error('creator_public_key must be a 33-byte compressed secp256k1 key (66 hex chars)');
	}
	if (!signatureHex || !/^[0-9a-fA-F]{128}$/.test(signatureHex)) {
		throw new Error('signature must be a 64-byte ECDSA signature (128 hex chars)');
	}

	const fields = {
		t: COLLECTION_MEMO_TYPE,
		s: slug,
		n: name,
		mp: String(Number(Number(mintPrice).toFixed(8))),
		nce: String(Number(nonce)),
		cr: creatorPublicKey.toLowerCase(),
		sg: signatureHex.toLowerCase()
	};
	// Only emit `final` when set (never `final:0`); its presence is part of the
	// signed canonical payload.
	if (coerceFinalFlag(final)) {
		fields[COLLECTION_FINAL_FIELD] = '1';
	}
	if (externalUrl) {
		fields.url = externalUrl;
	}
	if (description) {
		fields.d = description;
	}
	if (timestamp !== undefined && timestamp !== null) {
		fields.ts = String(Number(timestamp));
	}
	return fields;
};

/**
 * Verify a collection update memo's signature.
 * @param {object} memoData - Parsed `nfpt_collection` memo.
 * @returns {{ valid: boolean, reason?: string, canonical?: string, hash?: string }}
 */
export const verifyCollectionMemoSignature = (memoData) => {
	if (!memoData || memoData.t !== COLLECTION_MEMO_TYPE) {
		return { valid: false, reason: `not an ${COLLECTION_MEMO_TYPE} memo` };
	}
	if (!memoData.s || !memoData.n || memoData.mp === undefined || memoData.nce === undefined) {
		return { valid: false, reason: 'missing required fields (s/n/mp/nce)' };
	}
	if (!memoData.cr || !memoData.sg) {
		return { valid: false, reason: 'missing cr / sg' };
	}

	let canonical;
	try {
		canonical = buildCanonicalPayload({
			slug: memoData.s,
			name: memoData.n,
			mintPrice: memoData.mp,
			externalUrl: memoData.url || '',
			nonce: memoData.nce,
			final: memoData[COLLECTION_FINAL_FIELD]
		});
	} catch (err) {
		return { valid: false, reason: `canonical build failed: ${err.message}` };
	}

	const valid = verifySignature(canonical, memoData.sg, memoData.cr);
	const hash = sha256Hash(canonical);
	return valid
		? { valid: true, canonical, hash }
		: { valid: false, reason: 'signature mismatch', canonical, hash };
};

/**
 * Sign a canonical payload. The returned hex is the memo's `sg:` value.
 * @param {string} canonical
 * @param {string} privateKeyHex
 * @returns {string}
 */
export const signCollectionUpdate = (canonical, privateKeyHex) =>
	signData(canonical, privateKeyHex);

/**
 * Compute the canonical payload and sign it in one go.
 * @returns {{ canonical: string, signatureHex: string }}
 */
export const buildAndSign = ({ slug, name, mintPrice, externalUrl, nonce, privateKeyHex, final = false }) => {
	const canonical = buildCanonicalPayload({ slug, name, mintPrice, externalUrl, nonce, final });
	const signatureHex = signCollectionUpdate(canonical, privateKeyHex);
	return { canonical, signatureHex };
};

/**
 * Convenience: derive the public key, build canonical, sign, and assemble the
 * on-chain memo fields — verifying locally before returning.
 * @returns {{ canonical: string, signatureHex: string, creatorPublicKey: string, fields: object }}
 */
export const buildSignedCollectionMemo = ({
	slug, name, mintPrice, externalUrl = '', nonce, privateKeyHex, description, timestamp, final = false
}) => {
	const creatorPublicKey = getPublicKeyFromPrivate(privateKeyHex);
	const { canonical, signatureHex } = buildAndSign({ slug, name, mintPrice, externalUrl, nonce, privateKeyHex, final });
	const fields = buildCollectionMemoFields({
		slug, name, mintPrice, externalUrl, nonce,
		creatorPublicKey, signatureHex, description, timestamp, final
	});
	const verification = verifyCollectionMemoSignature(fields);
	if (!verification.valid) {
		throw new Error(`signed memo failed local verification: ${verification.reason}`);
	}
	return { canonical, signatureHex, creatorPublicKey, fields };
};
