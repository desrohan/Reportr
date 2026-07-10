'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** A monospace command chip that copies its value to the clipboard on click. */
export function CopyCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — no-op, the text is still selectable */
    }
  }

  return (
    <button
      onClick={copy}
      className="group inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-blue-300 transition-colors hover:border-blue-500/50 hover:bg-zinc-800 cursor-pointer"
      title="Copy to clipboard"
    >
      <span className="select-all">{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-zinc-500 group-hover:text-blue-400" />
      )}
    </button>
  )
}
