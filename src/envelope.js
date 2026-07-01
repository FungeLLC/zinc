/**
 * @fileoverview ZINC-1 envelope: create, parse and validate the typed
 * `key:value` memo body that carries every inscription, plus the ZINC-2
 * (`nfpt`/`nfpt_*`) profile helpers.
 *
 * The envelope is a profile of ZIP 302 case-1 (UTF-8 text) memos: newline-
 * separated `key:value` records, the first being `t:<type>`, the whole thing
 * <= 512 bytes.
 */

import { NFPT_TYPES, VALIDATION_LIMITS } from './constants.js';

/** @param {string} url @returns {boolean} */
const isValidURL = (url) => {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
};

const looksLikeHex = (value) =>
	typeof value === 'string' && /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0;

/**
 * Normalise a memo as emitted by an Orchard scanner: either UTF-8 text
 * already, a hex string, or raw bytes (Buffer / number array). Returns trimmed
 * UTF-8 text with trailing nul padding stripped, or null when the input can't
 * be interpreted.
 *
 * NOTE: never attempt base64 here — lenient base64 decoders turn plain text
 * into silent garbage instead of failing.
 *
 * @param {string|Buffer|number[]|null} rawMemo
 * @returns {string|null}
 */
export const decodeScannerMemo = (rawMemo) => {
	if (rawMemo == null) return null;
	let memoText = null;
	if (typeof rawMemo === 'string') {
		if (looksLikeHex(rawMemo)) {
			try {
				memoText = Buffer.from(rawMemo, 'hex').toString('utf8');
			} catch {
				memoText = rawMemo;
			}
		} else {
			memoText = rawMemo;
		}
	} else if (Buffer.isBuffer(rawMemo)) {
		memoText = rawMemo.toString('utf8');
	} else if (Array.isArray(rawMemo)) {
		try {
			memoText = Buffer.from(rawMemo).toString('utf8');
		} catch {
			return null;
		}
	} else {
		return null;
	}
	if (typeof memoText !== 'string') return null;
	return memoText.replace(/\0+$/, '').trim();
};

// ZINC-1 key grammar: lowercase ASCII letters, digits and underscore,
// starting with a letter. Enforced at write time so a conforming producer
// can never emit a memo that different parsers read differently.
const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Serialise a memo-data object into the canonical envelope string.
 * @param {object} memoData - Field map; `t` MUST be present for a valid memo.
 * @returns {string} Newline-separated `key:value` memo body.
 */
export const createMemo = (memoData) => {
	const fields = [];
	for (const [key, value] of Object.entries(memoData)) {
		if (value !== undefined && value !== null && value !== '') {
			if (!KEY_RE.test(key)) {
				throw new Error(`Invalid memo key '${key}' (keys are lowercase ASCII letters, digits, underscore)`);
			}
			const valueStr = String(value);
			if (/[\r\n]/.test(valueStr)) {
				throw new Error(`Field '${key}' cannot contain newlines`);
			}
			if (key !== 't' && valueStr.includes(':')) {
				// Allow colons in fields that legitimately carry a scheme
				// separator (CID, registry hint, external URL).
				if (!['c', 'rg', 'url'].includes(key)) {
					throw new Error(`Field '${key}' cannot contain colons`);
				}
			}
			fields.push(`${key}:${valueStr}`);
		}
	}
	const memo = fields.join('\n');
	// ZIP-302 limits the memo to 512 BYTES of UTF-8; `memo.length` counts
	// UTF-16 code units and undercounts multibyte characters, so measure
	// with Buffer.byteLength.
	const memoBytes = Buffer.byteLength(memo, 'utf8');
	if (memoBytes > VALIDATION_LIMITS.MEMO_MAX_SIZE) {
		throw new Error(`Memo too large: ${memoBytes} bytes (max ${VALIDATION_LIMITS.MEMO_MAX_SIZE})`);
	}
	return memo;
};

/**
 * Parse an envelope string into a field map. Splits each line on the FIRST
 * colon only, so values may contain further colons. Duplicate keys are
 * rejected: silently letting the last (or first) occurrence win invites
 * parser-differential attacks where two implementations read different
 * prices/CIDs out of one memo.
 * @param {string} memo
 * @returns {object}
 */
export const parseMemo = (memo) => {
	if (!memo || typeof memo !== 'string') {
		throw new Error('Invalid memo format');
	}
	const result = {};
	for (const line of memo.split('\n')) {
		if (!line.trim()) continue;
		const colonIndex = line.indexOf(':');
		if (colonIndex === -1) {
			throw new Error(`Invalid line format: ${line}`);
		}
		const key = line.substring(0, colonIndex);
		const value = line.substring(colonIndex + 1);
		if (!key) {
			throw new Error(`Empty key in line: ${line}`);
		}
		if (Object.prototype.hasOwnProperty.call(result, key)) {
			throw new Error(`Duplicate key in memo: ${key}`);
		}
		result[key] = value;
	}
	return result;
};

/**
 * Validate a parsed memo's wire-level shape for its `t:` type.
 * @param {object} memoData - Parsed memo.
 * @param {string|null} expectedType - Required type, or null to accept any.
 * @returns {boolean} Whether the memo is structurally valid.
 */
export const validateMemo = (memoData, expectedType = null) => {
	try {
		if (!memoData || typeof memoData !== 'object') {
			throw new Error('Invalid memo data structure');
		}
		if (!memoData.t) {
			throw new Error('Missing type field (t)');
		}
		if (expectedType && memoData.t !== expectedType) {
			throw new Error(`Expected type '${expectedType}', got '${memoData.t}'`);
		}

		switch (memoData.t) {
			case NFPT_TYPES.INSCRIPTION:
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for inscription');
				}
				if (!memoData.c.startsWith('ipfs://')) {
					throw new Error('CID must start with ipfs://');
				}
				// `cr`/`sg` are OPTIONAL; genuine mints are typically unsigned
				// (authenticity derives from the registry inbox + content CID).
				break;

			case NFPT_TYPES.COLLECTION:
				if (!memoData.s) {
					throw new Error('Missing slug field (s) for collection');
				}
				if (!memoData.n) {
					throw new Error('Missing name field (n) for collection');
				}
				if (memoData.mp === undefined || memoData.mp === '') {
					throw new Error('Missing mint price field (mp) for collection');
				}
				if (isNaN(parseFloat(memoData.mp)) || parseFloat(memoData.mp) <= 0) {
					throw new Error(`Invalid mint price (mp) for collection: ${memoData.mp}`);
				}
				if (memoData.nce === undefined || memoData.nce === '') {
					throw new Error('Missing nonce field (nce) for collection');
				}
				if (!Number.isInteger(Number(memoData.nce)) || Number(memoData.nce) < 0) {
					throw new Error(`Invalid nonce (nce) for collection: ${memoData.nce}`);
				}
				if (!memoData.cr) {
					throw new Error('Missing creator field (cr) for collection');
				}
				if (!memoData.sg) {
					throw new Error('Missing signature field (sg) for collection');
				}
				if (memoData.url && !isValidURL(memoData.url)) {
					throw new Error(`Invalid external URL (url) for collection: ${memoData.url}`);
				}
				// Optional ZSA-style supply lock; when present must be '0' or '1'.
				if (memoData.final !== undefined
					&& memoData.final !== '0' && memoData.final !== '1'
					&& memoData.final !== 0 && memoData.final !== 1) {
					throw new Error(`Invalid final flag for collection: ${memoData.final}`);
				}
				break;

			case NFPT_TYPES.FEE:
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for fee');
				}
				break;

			case NFPT_TYPES.ROYALTY:
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for royalty');
				}
				break;

			case NFPT_TYPES.TRANSFER:
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for transfer');
				}
				break;

			case NFPT_TYPES.PURCHASE_TRANSFER:
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for purchase transfer');
				}
				break;

			case NFPT_TYPES.AUTO_PURCHASE:
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for auto purchase');
				}
				break;

			case NFPT_TYPES.LIST:
				// `cancel:1` removes a listing; then `p` is optional.
				if (memoData.cancel === '1' || memoData.cancel === 1) {
					if (!memoData.c && !memoData.r) {
						throw new Error('Missing identifier (c or r) for listing cancel');
					}
					break;
				}
				// Two identifier patterns: legacy (c+p) or tagged (r) where the
				// listing data is sealed in an off-chain payload.
				if (memoData.r) {
					if (!/^[0-9a-f]{64}$/i.test(memoData.r)) {
						throw new Error('Listing tag (r) must be 64 lowercase hex chars');
					}
					break;
				}
				if (!memoData.c) {
					throw new Error('Missing CID field (c) for listing');
				}
				if (!memoData.p) {
					throw new Error('Missing price field (p) for listing');
				}
				if (isNaN(parseFloat(memoData.p)) || parseFloat(memoData.p) <= 0) {
					throw new Error('Invalid price (p) for listing');
				}
				break;

			default:
				// Unknown type tag — a future/foreign profile. Length checks
				// below still apply; type-specific validation is the profile's.
				break;
		}

		if (memoData.n && memoData.n.length > VALIDATION_LIMITS.NAME_MAX_LENGTH) {
			throw new Error(`Name too long: ${memoData.n.length} chars (max ${VALIDATION_LIMITS.NAME_MAX_LENGTH})`);
		}
		if (memoData.d && memoData.d.length > VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH) {
			throw new Error(`Description too long: ${memoData.d.length} chars (max ${VALIDATION_LIMITS.DESCRIPTION_MAX_LENGTH})`);
		}
		if (memoData.cr && Buffer.from(memoData.cr, 'hex').length !== VALIDATION_LIMITS.PUBLIC_KEY_LENGTH) {
			throw new Error('Invalid creator public key length');
		}
		if (memoData.sg && Buffer.from(memoData.sg, 'hex').length !== VALIDATION_LIMITS.SIGNATURE_LENGTH) {
			throw new Error('Invalid signature length');
		}
		return true;
	} catch {
		return false;
	}
};

/**
 * Build the data string signed by ZINC-2 inscription `sg`: `c|f|n|d[|ts]`.
 *
 * A literal `|` inside any signed field would shift the remaining fields
 * along the canonical string, letting two different payloads share one
 * signature — so such input is refused at both sign and verify time.
 * @param {object} memoData
 * @returns {string}
 */
export const generateSignatureData = (memoData) => {
	const parts = [
		memoData.c || '',
		memoData.f || '',
		memoData.n || '',
		memoData.d || ''
	];
	if (memoData.ts) {
		parts.push(memoData.ts);
	}
	for (const part of parts) {
		if (String(part).includes('|')) {
			throw new Error('Signed fields must not contain the "|" delimiter');
		}
	}
	return parts.join('|');
};

/**
 * Extract the bare CID from a memo (string or parsed), stripping `ipfs://`.
 * @param {string|object} memo
 * @returns {string|null}
 */
export const extractCID = (memo) => {
	try {
		const memoData = typeof memo === 'string' ? parseMemo(memo) : memo;
		const cid = memoData.c;
		if (!cid) return null;
		return cid.startsWith('ipfs://') ? cid.substring(7) : cid;
	} catch {
		return null;
	}
};

/**
 * Normalise a raw `c:` value into the bare CID (accepts `ipfs://<cid>` or
 * `<cid>`). Returns null for empty / non-string input.
 * @param {string|undefined|null} rawCidField
 * @returns {string|null}
 */
export const normaliseCid = (rawCidField) => {
	if (rawCidField == null) return null;
	const value = String(rawCidField).trim();
	if (!value) return null;
	return value.startsWith('ipfs://') ? value.substring(7) : value;
};

/** @param {object} memoData @returns {boolean} */
export const isCancelListing = (memoData) => {
	if (!memoData || memoData.t !== NFPT_TYPES.LIST) return false;
	return memoData.cancel === '1' || memoData.cancel === 1;
};

/** @param {object} memoData @returns {boolean} */
export const isTaggedListing = (memoData) => {
	if (!memoData || memoData.t !== NFPT_TYPES.LIST) return false;
	if (memoData.cancel === '1' || memoData.cancel === 1) return false;
	return typeof memoData.r === 'string' && /^[0-9a-f]{64}$/i.test(memoData.r);
};

/** @param {string|object} memo @returns {boolean} */
export const isNFPTPurchaseTransfer = (memo) => {
	try {
		const memoData = typeof memo === 'string' ? parseMemo(memo) : memo;
		return memoData?.t === NFPT_TYPES.PURCHASE_TRANSFER;
	} catch {
		return false;
	}
};

/** @param {string|object} memo @returns {boolean} */
export const isNFPTListing = (memo) => {
	try {
		const memoData = typeof memo === 'string' ? parseMemo(memo) : memo;
		return memoData?.t === NFPT_TYPES.LIST;
	} catch {
		return false;
	}
};

/** @param {string|object} memo @returns {boolean} */
export const isNFPTInscription = (memo) => {
	try {
		const memoData = typeof memo === 'string' ? parseMemo(memo) : memo;
		return memoData.t === NFPT_TYPES.INSCRIPTION;
	} catch {
		return false;
	}
};

/** @param {string|object} memo @returns {boolean} */
export const isNFPTTransfer = (memo) => {
	try {
		const memoData = typeof memo === 'string' ? parseMemo(memo) : memo;
		return memoData.t === NFPT_TYPES.TRANSFER
			|| memoData.t === NFPT_TYPES.PURCHASE_TRANSFER;
	} catch {
		return false;
	}
};

/**
 * UTF-8 byte length of a memo (the figure that must be <= 512).
 * @param {string} memo
 * @returns {number}
 */
export const getMemoSize = (memo) => Buffer.byteLength(memo, 'utf8');
