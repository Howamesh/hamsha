import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** First letters of up to two words — used for avatar / brand tiles. */
export function initials(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, max)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Project prefix like "SM" for "Social Media" (≤3 chars). */
export function prefix(name: string): string {
  const words = name.trim().split(/[\s&/]+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}
