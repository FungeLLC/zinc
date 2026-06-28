/**
 * @fileoverview ZSA (ZIP 226/227) bridge identity for ZINC-2 tokens.
 *
 * ZINC runs on today's deployed protocol; Zcash Shielded Assets (OrchardZSA,
 * ZIP 226/227) are the consensus-level home for native, note-bound assets that
 * lands with NU7. This module makes the ZINC -> ZSA bridge **deterministic by
 * construction**: from a ZINC-2 token's stable identity (the collection's
 * issuer key + the token's registry inbox + content id) it derives exactly the
 * ZSA Asset Identifier / Digest that the same issuer would mint post-NU7.
 *
 * It implements the public, hashable half of ZIP 227 § "Asset Identifier,
 * Asset Digest, and Asset Base":
 *
 *   asset_desc      = "ZINC-2|<registry>|<cid>"               (our canonical desc)
 *   assetDescHash   = BLAKE2b-256("ZSA-AssetDescCRH", asset_desc)
 *   issuer          = ik_encoding = 0x00 || ik                (ik = 32-byte x-only key)
 *   EncodeAssetId   = 0x00 || issuer || assetDescHash         (66 bytes)
 *   AssetDigest     = BLAKE2b-512("ZSA-Asset-Digest", EncodeAssetId)
 *
 * The final AssetBase = GroupHash^P("z.cash:OrchardZSA", AssetDigest) is a
 * Pallas group-hash performed inside the NU7 issuance circuit and is
 * deliberately NOT computed here (it needs the proving stack). AssetDigest is
 * the canonical, compact identifier ZIP 227 itself recommends wallets key on.
 *
 * Issuer-key note: ZSA issuance uses a BIP-340 (x-only) key. A ZINC collection
 * owner key is a 33-byte *compressed* secp256k1 key; its x-only form is simply
 * the 32-byte X coordinate, so the SAME key can later issue the bridged asset.
 */

import { blake2b } from '@noble/hashes/blake2.js';
import { normaliseCid } from './envelope.js';

// ZIP 227 BLAKE2b personalisation tags. Each MUST be exactly 16 bytes (the
// BLAKE2 personal field width); both of these are 16 ASCII chars by design.
export const ZSA_ASSET_DESC_PERSONAL = 'ZSA-AssetDescCRH';
export const ZSA_ASSET_DIGEST_PERSONAL = 'ZSA-Asset-Digest';

// Version / scheme bytes defined by ZIP 227.
export const ZSA_ISSUER_SIG_SCHEME_BIP340 = 0x00; // first byte of ik_encoding
export const ZSA_ASSET_ID_VERSION = 0x00; // first byte of EncodeAssetId

// Our canonical asset_desc profile tag for ZINC-2 tokens.
export const ZINC2_ASSET_DESC_PREFIX = 'ZINC-2';

const BLAKE2_PERSONAL_BYTES = 16;
const HEX32_RE = /^[0-9a-fA-F]{64}$/; // 32 bytes
const HEX33_RE = /^[0-9a-fA-F]{66}$/; // 33 bytes (compressed pubkey / issuer)
const HEX66_RE = /^[0-9a-fA-F]{132}$/; // 66 bytes (EncodeAssetId)

/**
 * Encode a personalisation tag as the fixed-width 16-byte BLAKE2 personal
 * field. Asserts the tag is exactly 16 bytes so a typo can never silently
 * change the derived identifiers.
 * @param {string} tag
 * @returns {Uint8Array}
 */
const personal16 = (tag) => {
	const bytes = new TextEncoder().encode(tag);
	if (bytes.length !== BLAKE2_PERSONAL_BYTES) {
		throw new Error(`BLAKE2b personalisation '${tag}' must be ${BLAKE2_PERSONAL_BYTES} bytes, got ${bytes.length}`);
	}
	return bytes;
};

const toHex = (bytes) => Buffer.from(bytes).toString('hex');

const byteToHex = (value) => value.toString(16).padStart(2, '0');

/**
 * Derive the ZSA issuer identifier from a collection owner's compressed
 * secp256k1 public key.
 * @param {string} compressedPublicKeyHex - 33-byte compressed key (66 hex chars).
 * @returns {{ issuer: string, xonly: string }} issuer = ik_encoding (33 bytes, hex).
 */
export const deriveZsaIssuer = (compressedPublicKeyHex) => {
	if (typeof compressedPublicKeyHex !== 'string' || !HEX33_RE.test(compressedPublicKeyHex)) {
		throw new Error('compressedPublicKeyHex must be a 33-byte compressed secp256k1 key (66 hex chars)');
	}
	const lower = compressedPublicKeyHex.toLowerCase();
	const prefix = lower.slice(0, 2);
	if (prefix !== '02' && prefix !== '03') {
		throw new Error(`compressed key must start with 02 or 03, got ${prefix}`);
	}
	const xonly = lower.slice(2); // 32-byte X coordinate == BIP-340 x-only key
	const issuer = byteToHex(ZSA_ISSUER_SIG_SCHEME_BIP340) + xonly;
	return { issuer, xonly };
};

/**
 * Build the canonical ZINC-2 asset description for a token. Deterministic from
 * the token's stable identity (registry inbox + content id).
 * @param {{ registry: string, cid: string }} args
 * @returns {string}
 */
export const buildAssetDesc = ({ registry, cid } = {}) => {
	const reg = typeof registry === 'string' ? registry.trim() : '';
	const bareCid = normaliseCid(cid);
	if (!reg) {
		throw new Error('registry is required to build a ZSA asset_desc');
	}
	if (!bareCid) {
		throw new Error('cid is required to build a ZSA asset_desc');
	}
	if (reg.includes('|') || bareCid.includes('|')) {
		throw new Error("registry/cid cannot contain '|' (asset_desc delimiter)");
	}
	return `${ZINC2_ASSET_DESC_PREFIX}|${reg}|${bareCid}`;
};

/**
 * assetDescHash = BLAKE2b-256("ZSA-AssetDescCRH", asset_desc).
 * @param {string} assetDesc
 * @returns {string} 32-byte hex digest.
 */
export const computeAssetDescHash = (assetDesc) => {
	if (typeof assetDesc !== 'string' || assetDesc.length === 0) {
		throw new Error('assetDesc must be a non-empty string');
	}
	const digest = blake2b(new TextEncoder().encode(assetDesc), {
		dkLen: 32,
		personalization: personal16(ZSA_ASSET_DESC_PERSONAL)
	});
	return toHex(digest);
};

/**
 * EncodeAssetId = 0x00 || issuer || assetDescHash (66 bytes).
 * @param {string} issuerHex - 33-byte issuer identifier (66 hex chars).
 * @param {string} assetDescHashHex - 32-byte asset-description hash (64 hex chars).
 * @returns {string} 66-byte hex encoding.
 */
export const encodeAssetId = (issuerHex, assetDescHashHex) => {
	if (typeof issuerHex !== 'string' || !HEX33_RE.test(issuerHex)) {
		throw new Error('issuer must be 33 bytes (66 hex chars)');
	}
	if (typeof assetDescHashHex !== 'string' || !HEX32_RE.test(assetDescHashHex)) {
		throw new Error('assetDescHash must be 32 bytes (64 hex chars)');
	}
	return (byteToHex(ZSA_ASSET_ID_VERSION) + issuerHex + assetDescHashHex).toLowerCase();
};

/**
 * AssetDigest = BLAKE2b-512("ZSA-Asset-Digest", EncodeAssetId).
 * @param {string} assetIdEncodedHex - 66-byte EncodeAssetId (132 hex chars).
 * @returns {string} 64-byte hex digest.
 */
export const computeAssetDigest = (assetIdEncodedHex) => {
	if (typeof assetIdEncodedHex !== 'string' || !HEX66_RE.test(assetIdEncodedHex)) {
		throw new Error('assetIdEncoded must be 66 bytes (132 hex chars)');
	}
	const digest = blake2b(Buffer.from(assetIdEncodedHex, 'hex'), {
		dkLen: 64,
		personalization: personal16(ZSA_ASSET_DIGEST_PERSONAL)
	});
	return toHex(digest);
};

/**
 * Full deterministic ZSA bridge identity for a ZINC-2 token: the provable
 * mapping from "a ZINC inscription today" to "the ZSA asset the same issuer
 * would mint after NU7".
 * @param {{ creatorPublicKey: string, registry: string, cid: string }} args
 * @returns {{ asset_desc: string, asset_desc_hash: string, issuer: string, asset_id_encoded: string, asset_digest: string, asset_base: null }}
 */
export const deriveZsaAssetIdentity = ({ creatorPublicKey, registry, cid } = {}) => {
	const { issuer } = deriveZsaIssuer(creatorPublicKey);
	const assetDesc = buildAssetDesc({ registry, cid });
	const assetDescHash = computeAssetDescHash(assetDesc);
	const assetIdEncoded = encodeAssetId(issuer, assetDescHash);
	const assetDigest = computeAssetDigest(assetIdEncoded);
	return {
		asset_desc: assetDesc,
		asset_desc_hash: assetDescHash,
		issuer,
		asset_id_encoded: assetIdEncoded,
		asset_digest: assetDigest,
		// AssetBase = GroupHash^P("z.cash:OrchardZSA", AssetDigest): a Pallas
		// group hash computed inside the NU7 issuance circuit; not derivable
		// here without the proving stack. Intentionally null.
		asset_base: null
	};
};
