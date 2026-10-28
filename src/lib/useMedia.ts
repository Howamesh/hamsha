import { useEffect, useMemo, useState } from 'react'
import { repo } from '@/data'

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

/** Object URL of a picked file, revoked when the file changes or the component unmounts. */
export function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}
