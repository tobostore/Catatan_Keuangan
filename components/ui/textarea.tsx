import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-muted text-foreground',
        'flex field-sizing-content min-h-20 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm',
        'shadow-sm transition-all outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/30',
        'aria-invalid:ring-1 aria-invalid:ring-red/30 aria-invalid:border-red',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
