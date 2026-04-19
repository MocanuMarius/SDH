import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import apiPlugin from './vite-plugin-api'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Always load .env.local from this project folder (same dir as vite.config.ts), so env works even when cwd is different (e.g. multi-root workspace)
loadDotenv({ path: path.join(__dirname, '.env.local') })

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fromProcess = process.env as Record<string, string>
  const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL ||
    fromProcess.VITE_SUPABASE_URL || fromProcess.NEXT_PUBLIC_SUPABASE_URL || fromProcess.SUPABASE_URL || ''
  const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY ||
    fromProcess.VITE_SUPABASE_ANON_KEY || fromProcess.NEXT_PUBLIC_SUPABASE_ANON_KEY || fromProcess.SUPABASE_ANON_KEY || ''
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
      // De-dupe so any dep that pulls its own React doesn't shadow ours.
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      // The previous `stream` and `csv-parser` aliases were workarounds
      // for goat-fin's taxCalculator pulling Node-only modules into the
      // browser bundle. With the broker-import surface retired, no
      // browser code needs goat-fin anymore — aliases removed along
      // with the stub files.
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(key),
    },
    build: {
      // Split heavy vendor libs into their own chunks so:
      //  - the main bundle (was 1.4MB → ~1MB) gets smaller and parses faster
      //  - pages that don't touch a chunk skip downloading it (Insights is
      //    the only Recharts consumer; Tickers/Trades are the only DataGrid
      //    consumers; the per-ticker page is the only @visx consumer chain)
      //  - the chunks are cacheable across deploys when their deps don't move
      rollupOptions: {
        output: {
          manualChunks: {
            recharts: ['recharts'],
            'mui-data-grid': ['@mui/x-data-grid'],
            visx: [
              '@visx/axis', '@visx/brush', '@visx/curve', '@visx/event',
              '@visx/gradient', '@visx/grid', '@visx/group', '@visx/responsive',
              '@visx/scale', '@visx/shape', '@visx/tooltip',
            ],
            // Bucket the framework runtime so route changes don't re-download it.
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  }
})
