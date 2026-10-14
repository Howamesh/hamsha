import { createMockRepo } from './mock'
import type { Repo } from './repo'

/**
 * Single switch for the data backend. When the Supabase project exists:
 *   VITE_BACKEND=supabase  →  createSupabaseRepo()
 */
export const repo: Repo = createMockRepo()
