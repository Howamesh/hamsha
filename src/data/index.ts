import { createMockRepo } from './mock'
import { createSupabaseRepo } from './supabase'
import type { Repo } from './repo'

/**
 * Single switch for the data backend — fails closed: an unknown or not-yet-implemented
 * backend throws at startup instead of silently running the passwordless demo store.
 *   VITE_BACKEND=mock      → demo store in the browser (default while developing)
 *   VITE_BACKEND=supabase  → createSupabaseRepo() (src/data/supabase.ts; needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
 */
const BACKEND = (import.meta.env.VITE_BACKEND ?? 'mock') as string

function createRepo(): Repo {
  // A production build (Netlify) must say which backend it uses — an unset variable
  // would otherwise ship the passwordless demo store to the real domain.
  if (import.meta.env.PROD && !import.meta.env.VITE_BACKEND) {
    throw new Error('VITE_BACKEND is not set for this production build (expected "supabase").')
  }
  switch (BACKEND) {
    case 'mock':
      return createMockRepo()
    case 'supabase':
      return createSupabaseRepo()
    default:
      throw new Error(`Unknown VITE_BACKEND "${BACKEND}" (expected "mock" or "supabase").`)
  }
}

export const repo: Repo = createRepo()

/** Demo conveniences (try-without-account buttons, reset button) exist only on the mock backend and can be switched off with VITE_DEMO=false. */
export const IS_DEMO = BACKEND === 'mock' && import.meta.env.VITE_DEMO !== 'false'
