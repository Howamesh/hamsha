import { useState } from 'react'
import { ImagePlus, Plus, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStr } from '@/lib/useStr'
import { useData, useSession } from '@/store/session'
import { useUi } from '@/store/ui'
import type { OrgLegal } from '@/types'
import { EMPTY_LEGAL, emptyBank } from '@/lib/contracts'
import { Button, Input, SectionTitle } from '../ui'

/**
 * «الهوية القانونية» (admin, Settings): Hawamish's party block, default signer, bank accounts and the round
 * stamp. Typed once, copied into every new contract — never hard-coded (the repository is public).
 */
export function LegalSettings() {
  const { t } = useStr()
  const s = useData()
  const sess = useSession()
  const setToast = useUi((u) => u.setToast)
  // derived-state reset: when the saved profile changes (another admin / reload), start from it again
  const [st, setSt] = useState<{ base: OrgLegal | null; l: OrgLegal }>(() => ({ base: s.legal, l: JSON.parse(JSON.stringify(s.legal ?? EMPTY_LEGAL)) }))
  if (st.base !== s.legal) setSt({ base: s.legal, l: JSON.parse(JSON.stringify(s.legal ?? EMPTY_LEGAL)) })
  const l = st.l
  const setL = (f: OrgLegal | ((x: OrgLegal) => OrgLegal)) => setSt((x) => ({ ...x, l: typeof f === 'function' ? f(x.l) : f }))
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(l) !== JSON.stringify(s.legal ?? EMPTY_LEGAL)
  const up = (patch: Partial<OrgLegal['party']>) => setL((x) => ({ ...x, party: { ...x.party, ...patch } }))
  const field = 'py-1.5 text-[13px]'
  async function save() {
    setBusy(true)
    try {
      await sess.saveLegal(l)
      setToast(t('accountSaved'), 'info')
    } catch {
      /* toast shown by the store */
    } finally {
      setBusy(false)
    }
  }
  const stamp = (f: File | null) => {
    if (!f || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type) || f.size > 400 * 1024) return
    const r = new FileReader()
    r.onload = () => setL((x) => ({ ...x, stamp: String(r.result) }))
    r.readAsDataURL(f)
  }
  return (
    <div className="rounded-md border border-border p-3 flex flex-col gap-3" data-testid="legal-settings">
      <div className="flex items-center gap-2">
        <SectionTitle>الهوية القانونية لهوامش (العقود)</SectionTitle>
        <Button size="sm" variant="primary" className="ms-auto" disabled={!dirty || busy} onClick={() => void save()} data-testid="legal-save">
          <Save size={14} /> {t('saveAccount')}
        </Button>
      </div>
      <div className="text-[11px] text-fg-muted">تُكتب مرة واحدة وتُنسخ في كل عقد جديد: الاسم، السجل التجاري، العنوان، الممثل، الحسابات البنكية، الختم.</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fName')}</SectionTitle><Input value={l.party.name} onChange={(e) => up({ name: e.target.value })} dir="auto" className={field} /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fCr')}</SectionTitle><Input value={l.party.cr} onChange={(e) => up({ cr: e.target.value })} dir="ltr" className={field} data-testid="legal-cr" /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fCountry')}</SectionTitle><Input value={l.party.country} onChange={(e) => up({ country: e.target.value })} dir="auto" className={field} /></label>
        <label className="flex flex-col gap-1 col-span-2"><SectionTitle>{t('fCity')}</SectionTitle><Input value={l.party.city} onChange={(e) => up({ city: e.target.value })} dir="auto" className={field} /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fRepTitle')}</SectionTitle><Input value={l.party.repTitle} onChange={(e) => up({ repTitle: e.target.value })} dir="auto" className={field} /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fRepName')}</SectionTitle><Input value={l.party.repName} onChange={(e) => up({ repName: e.target.value })} dir="auto" className={field} data-testid="legal-rep" /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fPhone')}</SectionTitle><Input value={l.party.phone} onChange={(e) => up({ phone: e.target.value })} dir="ltr" className={field} /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fEmail')}</SectionTitle><Input value={l.party.email} onChange={(e) => up({ email: e.target.value })} dir="ltr" className={field} /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('fNationalId')}</SectionTitle><Input value={l.party.nationalId} onChange={(e) => up({ nationalId: e.target.value })} dir="ltr" className={field} /></label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1"><SectionTitle>{t('signerName')}</SectionTitle><Input value={l.signer.name} onChange={(e) => setL((x) => ({ ...x, signer: { ...x.signer, name: e.target.value } }))} dir="auto" className={field} data-testid="legal-signer" /></label>
        <label className="flex flex-col gap-1"><SectionTitle>{t('signerCapacity')}</SectionTitle><Input value={l.signer.capacity} onChange={(e) => setL((x) => ({ ...x, signer: { ...x.signer, capacity: e.target.value } }))} dir="auto" className={field} /></label>
      </div>
      <SectionTitle>{t('secBank')}</SectionTitle>
      {l.banks.map((b, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 relative">
          <label className="flex flex-col gap-1"><SectionTitle>صاحب الحساب</SectionTitle><Input value={b.owner} onChange={(e) => setL((x) => ({ ...x, banks: x.banks.map((y, j) => (j === i ? { ...y, owner: e.target.value } : y)) }))} dir="auto" className={field} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>رقم الحساب</SectionTitle><Input value={b.account} onChange={(e) => setL((x) => ({ ...x, banks: x.banks.map((y, j) => (j === i ? { ...y, account: e.target.value } : y)) }))} dir="ltr" className={field} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>IBAN</SectionTitle><Input value={b.iban} onChange={(e) => setL((x) => ({ ...x, banks: x.banks.map((y, j) => (j === i ? { ...y, iban: e.target.value } : y)) }))} dir="ltr" className={field} data-testid={`legal-iban-${i}`} /></label>
          <label className="flex flex-col gap-1"><SectionTitle>Swift</SectionTitle><Input value={b.swift} onChange={(e) => setL((x) => ({ ...x, banks: x.banks.map((y, j) => (j === i ? { ...y, swift: e.target.value } : y)) }))} dir="ltr" className={field} /></label>
          <Button size="icon" variant="ghost" className="absolute top-1 end-1 text-accent" onClick={() => setL((x) => ({ ...x, banks: x.banks.filter((_, j) => j !== i) }))} aria-label={t('mediaRemove')}><Trash2 size={13} /></Button>
        </div>
      ))}
      <Button size="sm" className="self-start" onClick={() => setL((x) => ({ ...x, banks: [...x.banks, emptyBank()] }))} data-testid="legal-add-bank"><Plus size={14} /> {t('secBank')}</Button>
      <div className="flex items-center gap-3">
        <label className={cn('inline-flex items-center gap-1.5 text-[12.5px] font-semibold cursor-pointer rounded-md border border-border px-3 py-1.5 hover:border-fg-faint')}>
          <ImagePlus size={14} /> الختم الرسمي (PNG)
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { stamp(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </label>
        {l.stamp && <img src={l.stamp} alt="" className="w-12 h-12 object-contain" />}
        {l.stamp && <button type="button" className="text-[11.5px] text-accent cursor-pointer" onClick={() => setL((x) => ({ ...x, stamp: '' }))}>{t('removeAvatar')}</button>}
      </div>
    </div>
  )
}
