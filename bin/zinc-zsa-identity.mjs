#!/usr/bin/env node
/**
 * Compute the deterministic ZSA (ZIP 226/227) bridge identity for a ZINC-2
 * token, demonstrating that any ZINC inscription minted today has a
 * well-defined Asset Identifier / Digest the same issuer can mint natively
 * after NU7.
 *
 * Example:
 *
 *   zinc-zsa-identity \
 *     --creator-public-key 0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798 \
 *     --registry u1registryexampleaddress \
 *     --cid QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR
 */

import process from 'node:process';
import { deriveZsaAssetIdentity } from '../src/index.js';

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
	console.log('Usage: zinc-zsa-identity --creator-public-key <hex> --registry <addr> --cid <cid>');
	process.exit(0);
}

const required = ['creator-public-key', 'registry', 'cid'];
const missing = required.filter((k) => !args[k] || args[k] === true);
if (missing.length) {
	console.error(`Missing required arguments: ${missing.join(', ')}`);
	console.error('Run with --help for usage.');
	process.exit(2);
}

try {
	const identity = deriveZsaAssetIdentity({
		creatorPublicKey: String(args['creator-public-key']),
		registry: String(args.registry),
		cid: String(args.cid)
	});
	console.log(JSON.stringify(identity, null, 2));
} catch (err) {
	console.error(`Failed to derive ZSA bridge identity: ${err.message}`);
	process.exit(1);
}
