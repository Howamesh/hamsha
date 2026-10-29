/**
 * Domain model — mirrors the planned Supabase schema 1:1 so the mock
 * repository and the real one return identical shapes.
 */
import type { IsoDate } from '@/lib/dates'

export type Role = 'admin' | 'creative' | 'client'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Job title shown as small text under a creative's name */
  title?: string
  color: string
  /** For client users: which client they belong to */
  clientId?: string
}

export interface Client {
  id: string
  name: string
  color: string
  /** Project owner (the producer in charge) */
  ownerId: string
  /** Path/URL of the client's logo (shown on calendar cards) */
  logo?: string
  start: IsoDate
  end: IsoDate
  contract: 'draft' | 'sent' | 'signed'
  /** admin: block the client's view until a contract is signed (0009) */
  contractBlock?: boolean
}

export interface Project {
  id: string
  clientId: string
  name: string
  leadId: string
  color: string
}

export type TaskType = 'reel' | 'static' | 'carousel' | 'logo' | 'ui' | 'call'
export type ApprovalStatus = 'draft' | 'pending' | 'approved'

export interface Task {
  id: string
  projectId: string
  clientId: string
  title: string
  type: TaskType
  /** Inclusive all-day range. Client delivery = `end`; creative deadline = end − 1 day. */
  start: IsoDate
  end: IsoDate
  ownerId: string
  description?: string
  reference?: string
  milestone?: 'kickoff' | 'production' | 'delivery'
  approval: ApprovalStatus
  /** Optimistic-concurrency version (Codex's suggestion) */
  version: number
}

export interface TaskPart {
  id: string
  taskId: string
  label: string
  assigneeId: string
  hours: number
  day: IsoDate
  /** Optional hand-off time within the day, 'HH:MM' (e.g. content by 14:00, design by 17:00) */
  time?: string
  done: boolean
  order: number
}

export interface Attachment {
  id: string
  taskId: string
  name: string
  url?: string
}

export type ChannelId = 'team' | `client:${string}` | `task:${string}`

export interface Message {
  id: string
  channel: ChannelId
  senderId: string
  body: string
  at: string // ISO datetime
}

/** «ادعُ عضواً» — input of the admin invitation and the honest result (row written? e-mail sent?). */
export interface InviteInput {
  email: string
  role: Role
  name?: string
  /** required when role = 'client', forbidden otherwise */
  clientId?: string
}
export interface InviteResult {
  sent: boolean
  /** set when sent = false: 'already_registered' (an account with this e-mail exists) or 'send_failed' */
  reason?: 'already_registered' | 'send_failed'
  error?: string
}

/** A member who was invited but has not chosen a password yet (admin view). */
export interface PendingInvite {
  id: string
  email: string
  name: string
  role: Role
  clientId?: string
  invitedAt?: string
}

// ---------- «السوشل» phase 1 (0007_social.sql) ----------
export type PostPlatform = 'instagram' | 'tiktok' | 'snapchat' | 'linkedin' | 'x'
export type PostFormat = 'square' | 'portrait' | 'story'
/** draft (team) → sent (client decides) → approved | changes → published (link pasted). A new version returns to draft. */
export type PostStatus = 'draft' | 'sent' | 'approved' | 'changes' | 'published'
export type PostDecision = 'approved' | 'changes'

export interface Post {
  id: string
  clientId: string
  taskId?: string
  title: string
  platform: PostPlatform
  format: PostFormat
  status: PostStatus
  /** Number of the latest version (0 = nothing uploaded yet). The client's decision binds to this number. */
  currentVersion: number
  /** The client's platform account this post is for (preview header); optional. */
  accountId?: string
  sentAt?: string
  publishedUrl?: string
  publishedAt?: string
  /** Team only (the client view carries no people). */
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/** A frozen upload: images + caption never change after the insert; the decision is written by decide_post(). */
export interface PostVersion {
  id: string
  postId: string
  number: number
  /** Ordered storage paths (Supabase) or data URLs (demo store); index 0 is the cover. Resolve with repo.mediaUrl(). */
  imagePaths: string[]
  caption: string
  /** Server-set when the admin sent THIS version to the client; the client only ever sees sent versions. */
  sentAt?: string
  /** Team → client note shown with the version */
  note?: string
  decision?: PostDecision
  decisionNote?: string
  decidedAt?: string
  createdBy?: string
  createdAt: string
}

export interface NewPostInput {
  clientId: string
  taskId?: string
  accountId?: string
  title: string
  platform: PostPlatform
  format: PostFormat
}
/** Media of a new version, in display order: a freshly picked File or an existing path kept from the previous version. */
export type MediaItem = File | { path: string }
export interface NewVersionInput {
  postId: string
  media: MediaItem[]
  caption: string
  note?: string
}

/** The client's real account on one platform — what the preview header shows (no followers, no fake numbers). */
export interface ClientAccount {
  id: string
  clientId: string
  platform: PostPlatform
  /** without the @ */
  handle: string
  displayName: string
  /** Storage path (public bucket) or data URL (demo). Resolve with repo.publicUrl(). */
  avatarPath?: string
  bio?: string
}
export interface ClientAccountInput {
  id?: string
  clientId: string
  platform: PostPlatform
  handle: string
  displayName: string
  bio?: string
  /** a new picture to upload; `null` removes the current one; undefined keeps it */
  avatar?: File | null
}

// ---------- «العقود» (0009) ----------
export type ContractKind = 'short' | 'full' | 'offer'
export type ContractParty = 'client' | 'creative'
/** draft → sent → opened → signed | changes | rejected → completed. A new version returns to draft. */
export type ContractStatus = 'draft' | 'sent' | 'opened' | 'signed' | 'changes' | 'rejected' | 'completed'
export type ContractDecision = 'signed' | 'changes' | 'rejected'

export interface ContractPartyInfo {
  name: string
  /** commercial register */
  cr: string
  country: string
  city: string
  /** «ممثل X» */
  repTitle: string
  repName: string
  phone: string
  email: string
  nationalId: string
}
export interface ContractSection {
  num: string
  title: string
  /** plain text; lines starting with «1/» are numbered items, «أولاً:» sub-heads */
  body: string
  /** part of the fixed core («الدستور»): shown locked in the editor */
  fixed?: boolean
}
export interface ContractTrack {
  name: string
  nameEn: string
  months: number
  monthly: number
  /** one milestone per quarter */
  quarters: [string, string, string, string]
}
export interface ContractPackage {
  name: string
  subtitle: string
  price: number
  per: 'month' | 'once'
  items: string[]
}
export interface ContractInstallment {
  label: string
  amount: number
}
export interface ContractPricing {
  mode: 'monthly' | 'project'
  currency: string
  monthly: number
  months: number
  projectTotal: number
  installments: ContractInstallment[]
  lateDays: number
  supportMonths: number
}
export interface ContractBank {
  owner: string
  account: string
  iban: string
  swift: string
}
export interface ContractSigner {
  name: string
  capacity: string
}
/** Everything the paper shows — frozen with the version. */
export interface ContractContent {
  kind: ContractKind
  title: string
  project: string
  /** agreement date (Gregorian ISO); the Hijri line is derived when rendering */
  date: IsoDate
  /** which column the counterparty takes (the manager's short contracts put Hawamish first, the full ones put the client first) */
  counterpartySide: 'first' | 'second'
  hawamish: ContractPartyInfo
  counterparty: ContractPartyInfo
  scope: string
  sections: ContractSection[]
  pricing: ContractPricing
  tracks: ContractTrack[]
  packages: ContractPackage[]
  unitName: string
  unitPrice: number
  unitItems: string[]
  bank: ContractBank
  signers: { hawamish: ContractSigner; counterparty: ContractSigner }
  vars: { platforms: string; posts: number; designs: number; videos: number }
  accent: string
  copyrightYear: number
  /** Hawamish's round stamp (PNG data URL) frozen with the version so old contracts never change */
  stamp?: string
}

export interface Contract {
  id: string
  number: number
  kind: ContractKind
  party: ContractParty
  clientId?: string
  creativeId?: string
  title: string
  accent: string
  status: ContractStatus
  currentVersion: number
  sentAt?: string
  decidedAt?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}
export interface ContractVersion {
  id: string
  contractId: string
  number: number
  content: ContractContent
  contentHash: string
  note?: string
  firstSignature?: string
  firstSigner?: string
  firstCapacity?: string
  firstSignedAt?: string
  sentAt?: string
  openedAt?: string
  decision?: ContractDecision
  decisionNote?: string
  signature?: string
  signerName?: string
  signerCapacity?: string
  decidedAt?: string
  createdBy?: string
  createdAt: string
}
export interface ContractEvent {
  id: string
  contractId: string
  version?: number
  actor?: string
  actorRole?: string
  event: string
  meta: Record<string, unknown>
  at: string
}
export interface NewContractInput {
  kind: ContractKind
  party: ContractParty
  clientId?: string
  creativeId?: string
  title: string
  accent: string
}
/** Hawamish's legal identity, typed once by an admin (Settings) and copied into every contract version. */
export interface OrgLegal {
  party: ContractPartyInfo
  signer: ContractSigner
  banks: ContractBank[]
  /** round stamp PNG as a data URL (optional) */
  stamp: string
}
export interface SignatureInput {
  /** data:image/png;base64,… */
  signature: string
  name: string
  capacity: string
}

/** Carousel limits: the database allows up to 20 per version; platforms are stricter. */
export const MEDIA_MAX: Record<PostPlatform, number> = { instagram: 20, tiktok: 20, snapchat: 20, linkedin: 20, x: 4 }

export const POST_PLATFORMS: Record<PostPlatform, { en: string; ar: string; color: string }> = {
  instagram: { en: 'Instagram', ar: 'إنستقرام', color: '#E1306C' },
  tiktok: { en: 'TikTok', ar: 'تيك توك', color: '#111111' },
  snapchat: { en: 'Snapchat', ar: 'سناب شات', color: '#D9B600' },
  linkedin: { en: 'LinkedIn', ar: 'لينكدإن', color: '#0A66C2' },
  x: { en: 'X', ar: 'إكس', color: '#222222' },
}
export const POST_FORMATS: Record<PostFormat, { en: string; ar: string; ratio: number }> = {
  square: { en: 'Square 1:1', ar: 'مربع ١:١', ratio: 1 },
  portrait: { en: 'Portrait 4:5', ar: 'طولي ٤:٥', ratio: 4 / 5 },
  story: { en: 'Story 9:16', ar: 'ستوري ٩:١٦', ratio: 9 / 16 },
}

export type Presence = 'live' | 'away'

export interface Profile {
  userId: string
  city: string
  whStart: number
  whEnd: number
  notes: string
  theme: 'light' | 'dark'
  lang: 'ar' | 'en'
  weekStart: 'monday' | 'sunday'
}

/** Derived helpers (never stored — progress is computed from parts). */
export interface TaskProgress {
  done: number
  total: number
  hours: number
  pct: number
}

export const TASK_TYPES: Record<TaskType, { en: string; ar: string }> = {
  reel: { en: 'Reel / video', ar: 'ريل / فيديو' },
  static: { en: 'Static post', ar: 'منشور ثابت' },
  carousel: { en: 'Carousel', ar: 'كاروسيل' },
  logo: { en: 'Logo / animation', ar: 'شعار / موشن' },
  ui: { en: 'UI / product', ar: 'واجهة / منتج' },
  call: { en: 'Call / review', ar: 'اجتماع / مراجعة' },
}
