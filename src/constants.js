/**
 * @fileoverview Shared constants for the ZINC reference library.
 *
 * Only the standard-relevant subset is kept here (type tags, data formats and
 * the envelope validation limits). Application-specific economics (pricing,
 * registry addresses, rate limits) deliberately live in the consuming app, not
 * in the standard.
 */

// ZINC-2 (and related) on-chain type tags. `nfpt`/`nfpt_*` are retained for
// backwards compatibility with tokens already inscribed on mainnet; "ZINC-2"
// is the standard's name for the NFT profile, "NFPT" the legacy asset label.
export const NFPT_TYPES = {
	INSCRIPTION: 'nfpt',
	TRANSFER: 'nfpt_transfer',
	FEE: 'nfpt_fee',
	COLLECTION: 'nfpt_collection',
	ROYALTY: 'nfpt_royalty',
	LIST: 'nfpt_list',
	PURCHASE_TRANSFER: 'nfpt_purchase_transfer',
	AUTO_PURCHASE: 'nfpt_auto'
};

// Optional `f:` data-format hints for inline/inscribed payloads.
export const DATA_FORMATS = {
	BASE64: 'base64',
	HEX: 'hex',
	UTF8: 'utf8',
	JSON: 'json'
};

// ZINC-1 envelope limits. MEMO_MAX_SIZE is the Orchard/Sapling memo capacity.
export const VALIDATION_LIMITS = {
	MEMO_MAX_SIZE: 512,
	NAME_MAX_LENGTH: 50,
	DESCRIPTION_MAX_LENGTH: 20,
	COLLECTION_NAME_MAX_LENGTH: 100,
	COLLECTION_DESC_MAX_LENGTH: 500,
	PUBLIC_KEY_LENGTH: 33,
	SIGNATURE_LENGTH: 64,
	MAX_COLLECTION_SUPPLY: 100000
};
