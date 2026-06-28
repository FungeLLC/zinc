/**
 * Tests for the ZINC-1 envelope (create/parse/validate) and ZINC-2 profile
 * helpers.
 */

import {
	createMemo,
	parseMemo,
	validateMemo,
	normaliseCid,
	extractCID,
	decodeScannerMemo,
	generateSignatureData,
	getMemoSize,
	isNFPTInscription,
	isNFPTTransfer,
	isNFPTListing,
	isTaggedListing,
	isCancelListing
} from '../src/envelope.js'
import { NFPT_TYPES, VALIDATION_LIMITS } from '../src/constants.js'

const CID = 'QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR'

describe('envelope', () => {
	describe('createMemo / parseMemo', () => {
		test('round-trips a typed inscription, t first', () => {
			const memo = createMemo({ t: NFPT_TYPES.INSCRIPTION, c: `ipfs://${CID}`, f: 'json', n: 'Cat #1' })
			expect(memo.split('\n')[0]).toBe(`t:${NFPT_TYPES.INSCRIPTION}`)
			expect(parseMemo(memo)).toEqual({ t: NFPT_TYPES.INSCRIPTION, c: `ipfs://${CID}`, f: 'json', n: 'Cat #1' })
		})

		test('skips empty values and keeps colons in c/rg/url', () => {
			const memo = createMemo({ t: NFPT_TYPES.INSCRIPTION, c: `ipfs://${CID}`, d: '', url: 'https://x.example/a:b' })
			const parsed = parseMemo(memo)
			expect(parsed.d).toBeUndefined()
			expect(parsed.url).toBe('https://x.example/a:b')
		})

		test('rejects newlines and stray colons in non-scheme fields', () => {
			expect(() => createMemo({ t: NFPT_TYPES.INSCRIPTION, n: 'a\nb' })).toThrow(/newlines/)
			expect(() => createMemo({ t: NFPT_TYPES.INSCRIPTION, n: 'a:b' })).toThrow(/colons/)
		})

		test('enforces the 512-byte envelope limit', () => {
			expect(() => createMemo({ t: NFPT_TYPES.INSCRIPTION, c: 'x'.repeat(VALIDATION_LIMITS.MEMO_MAX_SIZE) }))
				.toThrow(/Memo too large/)
		})

		test('parseMemo splits on the first colon only', () => {
			expect(parseMemo('t:nfpt\nc:ipfs://abc:def')).toEqual({ t: 'nfpt', c: 'ipfs://abc:def' })
		})
	})

	describe('validateMemo', () => {
		test('accepts a minimal inscription, rejects a non-ipfs CID', () => {
			expect(validateMemo({ t: NFPT_TYPES.INSCRIPTION, c: `ipfs://${CID}` })).toBe(true)
			expect(validateMemo({ t: NFPT_TYPES.INSCRIPTION, c: CID })).toBe(false)
			expect(validateMemo({ t: NFPT_TYPES.INSCRIPTION })).toBe(false)
		})

		test('enforces expectedType', () => {
			expect(validateMemo({ t: NFPT_TYPES.TRANSFER, c: `ipfs://${CID}` }, NFPT_TYPES.TRANSFER)).toBe(true)
			expect(validateMemo({ t: NFPT_TYPES.TRANSFER, c: `ipfs://${CID}` }, NFPT_TYPES.INSCRIPTION)).toBe(false)
		})

		test('listing: legacy (c+p), tagged (r), and cancel forms', () => {
			expect(validateMemo({ t: NFPT_TYPES.LIST, c: `ipfs://${CID}`, p: '0.05' })).toBe(true)
			expect(validateMemo({ t: NFPT_TYPES.LIST, r: 'a'.repeat(64) })).toBe(true)
			expect(validateMemo({ t: NFPT_TYPES.LIST, r: 'xyz' })).toBe(false)
			expect(validateMemo({ t: NFPT_TYPES.LIST, cancel: '1', c: `ipfs://${CID}` })).toBe(true)
		})

		test('rejects an over-long name', () => {
			expect(validateMemo({ t: NFPT_TYPES.INSCRIPTION, c: `ipfs://${CID}`, n: 'x'.repeat(VALIDATION_LIMITS.NAME_MAX_LENGTH + 1) }))
				.toBe(false)
		})
	})

	describe('cid helpers', () => {
		test('normaliseCid strips ipfs:// and trims', () => {
			expect(normaliseCid(`ipfs://${CID}`)).toBe(CID)
			expect(normaliseCid(`  ${CID}  `)).toBe(CID)
			expect(normaliseCid('')).toBeNull()
			expect(normaliseCid(null)).toBeNull()
		})

		test('extractCID from string or object', () => {
			expect(extractCID(`t:nfpt\nc:ipfs://${CID}`)).toBe(CID)
			expect(extractCID({ c: `ipfs://${CID}` })).toBe(CID)
			expect(extractCID({})).toBeNull()
		})
	})

	describe('decodeScannerMemo', () => {
		test('decodes hex, passes through text, strips nul padding', () => {
			const text = 't:nfpt\nc:ipfs://abc'
			const hex = Buffer.from(text, 'utf8').toString('hex')
			expect(decodeScannerMemo(hex)).toBe(text)
			expect(decodeScannerMemo(`${text}\u0000\u0000`)).toBe(text)
			expect(decodeScannerMemo(Buffer.from(text, 'utf8'))).toBe(text)
			expect(decodeScannerMemo(null)).toBeNull()
		})
	})

	describe('type guards + misc', () => {
		test('inscription / transfer / listing guards', () => {
			expect(isNFPTInscription({ t: NFPT_TYPES.INSCRIPTION })).toBe(true)
			expect(isNFPTTransfer({ t: NFPT_TYPES.PURCHASE_TRANSFER })).toBe(true)
			expect(isNFPTListing({ t: NFPT_TYPES.LIST })).toBe(true)
			expect(isTaggedListing({ t: NFPT_TYPES.LIST, r: 'a'.repeat(64) })).toBe(true)
			expect(isCancelListing({ t: NFPT_TYPES.LIST, cancel: '1' })).toBe(true)
		})

		test('generateSignatureData joins c|f|n|d[|ts]', () => {
			expect(generateSignatureData({ c: 'C', f: 'json', n: 'N', d: 'D' })).toBe('C|json|N|D')
			expect(generateSignatureData({ c: 'C', f: 'json', n: 'N', d: 'D', ts: '123' })).toBe('C|json|N|D|123')
		})

		test('getMemoSize counts UTF-8 bytes', () => {
			expect(getMemoSize('abc')).toBe(3)
			expect(getMemoSize('é')).toBe(2)
		})
	})
})
