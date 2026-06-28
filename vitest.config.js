import { defineConfig } from 'vitest/config'

// Globals (describe/test/expect) keep the ported NFPT test bodies unchanged.
export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['test/**/*.test.js']
	}
})
