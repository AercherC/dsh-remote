import { defineConfig } from 'vitest/config'

/**
 * Plugin-local test discovery. Kept explicit so the browser-half component
 * tests (`*.test.tsx`, R06C4B) are collected alongside the host unit tests;
 * without this file vitest falls back to the repo-root config whose include
 * pattern only matches `*.test.ts`.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', '.tmp/**', '.pnpm-store/**'],
  },
})
