import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted file:font-semibold',
        'h-9 w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm',
        'shadow-sm transition-all outline-none',
        'file:inline-flex file:h-7 file:border-0 file:bg-transparent file:px-3 file:text-xs file:font-semibold',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30',
        'aria-invalid:ring-1 aria-invalid:ring-red/30 aria-invalid:border-red',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
