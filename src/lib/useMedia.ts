import { useEffect, useMemo, useState } from 'react'
import { repo } from '@/data'
import type { MediaItem } from '@/types'

/** Resolves a version's imagePath (storage path or data URL) to a URL an <img> can show. */
export function useMediaUrl(path?: string) {
  const [hit, setHit] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    let alive = true
    if (!path) return
    repo
      .mediaUrl(path)
      .then((url) => alive && setHit({ path, url }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [path])
  return path && hit?.path === path ? hit.url : null
}

/** Resolves an ordered list of paths (a version's carousel) to URLs; entries stay null until resolved. */
export function useMediaUrls(paths: string[]): Array<string | null> {
  const key = paths.join('\n')
  const [hit, setHit] = useState<{ key: string; urls: string[] } | null>(null)
  useEffect(() => {
    let alive = true
    if (!paths.length) return
    Promise.all(paths.map((p) => repo.mediaUrl(p).catch(() => '')))
      .then((urls) => alive && setHit({ key, urls }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return useMemo(() => (hit?.key === key ? hit.urls.map((u) => u || null) : paths.map(() => null)), [hit, key, paths])
}

/** Object URL of a picked file, revoked when the file changes or the component unmounts. */
export function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}

/** Preview URLs of an ordered media list being edited: object URLs for picked files, resolved URLs for kept paths. */
export function useObjectUrls(items: MediaItem[]): Array<string | null> {
  const files = useMemo(() => items.map((m) => (m instanceof File ? m : null)), [items])
  const paths = useMemo(() => items.filter((m): m is { path: string } => !(m instanceof File)).map((m) => m.path), [items])
  const resolved = useMediaUrls(paths)
  const objectUrls = useMemo(() => files.map((f) => (f ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => objectUrls.forEach((u) => u && URL.revokeObjectURL(u)), [objectUrls])
  return useMemo(() => {
    let k = 0
    return items.map((m, i) => (m instanceof File ? objectUrls[i] : (resolved[k++] ?? null)))
  }, [items, objectUrls, resolved])
}
