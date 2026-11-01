// Unsaved contract edits survive a refresh (his note, 1 Nov 2026: «لما احدث الصفحة يروح كل شيء كنت كاتبه»).
// Kept in THIS browser only, per contract, tied to the version it was edited from; cleared on save and on sign-out.
import type { ContractContent } from '@/types'

const PREFIX = 'hamsha.contractDraft.v1.'

export type ContractDraft = { base: string | null; content: ContractContent; note: string; at: string }

export function loadDraft(contractId: string): ContractDraft | null {
  try {
    const raw = localStorage.getItem(PREFIX + contractId)
    return raw ? (JSON.parse(raw) as ContractDraft) : null
  } catch {
    return null
  }
}

/** false = storage full or blocked: the editor still works, but the refresh safety net is off (the editor says so). */
export function saveDraft(contractId: string, draft: ContractDraft): boolean {
  try {
    localStorage.setItem(PREFIX + contractId, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function clearDraft(contractId: string) {
  try {
    localStorage.removeItem(PREFIX + contractId)
  } catch {
    /* ignore */
  }
}

/** On sign-out: nothing of one account's drafts stays for the next person on this browser. */
export function clearAllDrafts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
