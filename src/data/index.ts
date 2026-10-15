import { createMockRepo } from './mock'
import type { Repo } from './repo'

/**
 * Single switch for the data backend. When the Supabase project exists:
 *   VITE_BACKEND=supabase  →  createSupabaseRepo()
 */
export const repo: Repo = createMockRepo()

/** True while the app runs on the demo store (buttons like "reset demo data" only make sense then). */
export const IS_DEMO = import.meta.env.VITE_BACKEND !== 'supabase'
