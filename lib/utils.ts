import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCategoryColor(name: string, variant: 'income' | 'expense' = 'expense') {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const baseHue = Math.abs(hash) % 360
  const typeShift = variant === 'expense' ? 140 : 0
  const hue = (baseHue + typeShift) % 360
  const saturation = 55 + (Math.abs(hash >> 3) % 25)
  const lightness = 45 + (Math.abs(hash >> 5) % 12)
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`
}
