/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { iceServersFromEnv, type TurnEnv } from './api/turn.ts'

/**
 * Serves /api/turn during `npm run dev` and `npm run preview`, using the same
 * code as the Vercel function, so online play works locally without
 * `vercel dev`. TURN_* variables are read from .env.local on the server side
 * only: they do not start with VITE_, so Vite never puts them in the bundle.
 */
function turnApi(env: TurnEnv): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (req.method !== 'GET') return next()
    void iceServersFromEnv(env).then((iceServers) => {
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ iceServers }))
    })
  }
  return {
    name: 'turn-api',
    configureServer: (server) => void server.middlewares.use('/api/turn', handler),
    configurePreviewServer: (server) => void server.middlewares.use('/api/turn', handler),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), turnApi(loadEnv(mode, process.cwd(), 'TURN_'))],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
  },
}))
