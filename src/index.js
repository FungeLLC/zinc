/**
 * @fileoverview ZINC reference library entry point.
 *
 * Re-exports the four modules that make up the standard's reference
 * implementation:
 *   - constants  : type tags, data formats, envelope limits
 *   - crypto     : secp256k1 / SHA-256 signing primitives
 *   - envelope   : ZINC-1 memo create/parse/validate + ZINC-2 profile helpers
 *   - collection : signed `nfpt_collection` metadata (incl. `final` supply lock)
 *   - zsaBridge  : deterministic ZSA (ZIP 226/227) asset identity
 */

export * from './constants.js';
export * from './crypto.js';
export * from './envelope.js';
export * from './collection.js';
export * from './zsaBridge.js';
