/**
 * Vite plugin: handle /api/chart and /api/search-symbols in dev by calling Yahoo (same as Vercel serverless).
 * One command "npm run dev" — no separate API server needed.
 */
import type { Plugin } from 'vite';
export default function apiPlugin(): Plugin;
