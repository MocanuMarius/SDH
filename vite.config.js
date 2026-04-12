import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import apiPlugin from './vite-plugin-api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Always load .env.local from this project folder (same dir as vite.config.ts), so env works even when cwd is different (e.g. multi-root workspace)
loadDotenv({ path: path.join(__dirname, '.env.local') });
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const fromProcess = process.env;
    const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL ||
        fromProcess.VITE_SUPABASE_URL || fromProcess.NEXT_PUBLIC_SUPABASE_URL || fromProcess.SUPABASE_URL || '';
    const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY ||
        fromProcess.VITE_SUPABASE_ANON_KEY || fromProcess.NEXT_PUBLIC_SUPABASE_ANON_KEY || fromProcess.SUPABASE_ANON_KEY || '';
    return {
        plugins: [
            react({
                babel: {
                    plugins: [['babel-plugin-react-compiler', {}]],
                },
            }),
            apiPlugin(),
        ],
        resolve: {
            // Force all packages (including @mui/x-data-grid) to resolve to this project's
            // React 19 copy rather than the workspace-root React 18 (from goat-fin).
            dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
        },
        define: {
            'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
            'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
        },
    };
});
