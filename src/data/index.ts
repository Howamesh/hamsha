import { createMockRepo } from './mock'
import type { Repo } from './repo'

/**
 * Single switch for the data backend — fails closed: an unknown or not-yet-implemented
 * backend throws at startup instead of silently running the passwordless demo store.
 *   VITE_BACKEND=mock      → demo store in the browser (default while developing)
 *   VITE_BACKEND=supabase  → createSupabaseRepo() (added in the Supabase step)
 */
const BACKEND = (import.meta.env.VITE_BACKEND ?? 'mock') as string

function createRepo(): Repo {
  switch (BACKEND) {
    case 'mock':
      return createMockRepo()
    case 'supabase':
      throw new Error('VITE_BACKEND=supabase: the Supabase repository is not wired yet — refusing to fall back to the demo store.')
    default:
      throw new Error(`Unknown VITE_BACKEND "${BACKEND}" (expected "mock" or "supabase").`)
  }
}

export const repo: Repo = createRepo()

/** Demo conveniences (try-without-account buttons, reset button) exist only on the mock backend and can be switched off with VITE_DEMO=false. */
export const IS_DEMO = BACKEND === 'mock' && import.meta.env.VITE_DEMO !== 'false'
