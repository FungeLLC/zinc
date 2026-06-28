#!/usr/bin/env node
/**
 * Offline signer for ZINC-2 `nfpt_collection` metadata memos.
 *
 * The collection owner runs this locally so a signing key never has to travel
 * to any server. It prints either:
 *   - the canonical signing payload + signature + assembled memo fields (default), or
 *   - a JSON body to POST to an indexer's prepare-update endpoint (`--post-body`).
 *
 * Example:
 *
 *   zinc-sign-collection \
 *     --slug privacy-punks --name 'Privacy Punks' --mint-price 0.15 \
 *     --url https://example.com/privacy-punks --nonce 1 \
 *     --private-key <64-hex> [--final] [--post-body]
 *
 *   --final  irreversibly lock the collection's supply (ZSA `finalize` analogue).
 */

import process from 'node:process';
import {
	buildCanonicalPayload,
	signCollectionUpdate,
	verifyCollectionMemoSignature,
	buildCollectionMemoFields,
	getPublicKeyFromPrivate
} from '../src/index.js';

const parseArgs = (argv) => {
	const out = {};
	for (let i = 2; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith('--')) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith('--')) {
			out[key] = true;
		} else {
			out[key] = next;
			i += 1;
		}
	}
	return out;
};

const args = parseArgs(process.argv);

if (args.help) {
	console.log('Usage: zinc-sign-collection --slug … --name … --mint-price … --nonce … --private-key …');
	console.log("Optional: --url https://… --description '…' --final --post-body");
	console.log("  --final  irreversibly lock the collection's supply (ZSA finalize analogue).");
	process.exit(0);
}

const required = ['slug', 'name', 'mint-price', 'nonce', 'private-key'];
const missing = required.filter((k) => !args[k] || args[k] === true);
if (missing.length) {
	console.error(`Missing required arguments: ${missing.join(', ')}`);
	console.error('Run with --help for usage.');
	process.exit(2);
}

const slug = String(args.slug).toLowerCase();
const name = String(args.name);
const mintPrice = Number(args['mint-price']);
const externalUrl = args.url ? String(args.url) : '';
const description = args.description ? String(args.description) : '';
const nonce = Number(args.nonce);
const privateKeyHex = String(args['private-key']).toLowerCase();
const final = args.final === true || args.final === '1' || String(args.final).toLowerCase() === 'true';

if (!/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
	console.error('private-key must be 64 hex chars');
	process.exit(2);
}

const publicKey = getPublicKeyFromPrivate(privateKeyHex);
const canonical = buildCanonicalPayload({ slug, name, mintPrice, externalUrl, nonce, final });
const signatureHex = signCollectionUpdate(canonical, privateKeyHex);

const memoFields = buildCollectionMemoFields({
	slug,
	name,
	mintPrice,
	externalUrl,
	nonce,
	creatorPublicKey: publicKey,
	signatureHex,
	description,
	timestamp: Math.floor(Date.now() / 1000),
	final
});

const verification = verifyCollectionMemoSignature(memoFields);
if (!verification.valid) {
	console.error(`Signature failed local verification: ${verification.reason}`);
	process.exit(1);
}

if (args['post-body']) {
	const body = {
		mint_price: mintPrice,
		external_url: externalUrl,
		name,
		nonce,
		signature: signatureHex,
		creator_public_key: publicKey
	};
	if (description) body.description = description;
	if (final) body.final = 1;
	console.log(JSON.stringify(body, null, 2));
} else {
	console.log(JSON.stringify({
		slug,
		canonical,
		canonical_hash: verification.hash,
		signature: signatureHex,
		creator_public_key: publicKey,
		final,
		memo_fields: memoFields
	}, null, 2));
}
