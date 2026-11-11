/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// The balance suite plays a few hundred simulated lives: run with `npm run test:balance`.
export default defineConfig({
  test: { include: ['src/**/*.balance.ts'], testTimeout: 300_000 },
});
