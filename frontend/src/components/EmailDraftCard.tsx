import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface EmailDraftData {
  id: number
  to_field: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={cn(
        'shrink-0 font-mono text-[9px] uppercase tracking-wider transition-colors',
        copied ? 'text-emerald-400' : 'text-muted-foreground/30 hover:text-muted-foreground/70'
      )}
    >
      {copied ? '✓' : label}
    </button>
  )
}

export function EmailDraftCard({ draft }: { draft: EmailDraftData }) {
  const [bodyExpanded, setBodyExpanded] = useState(true)
  const [allCopied, setAllCopied] = useState(false)

  const copyAll = () => {
    const text = `To: ${draft.to_field}\nSubject: ${draft.subject}\n\n${draft.body}`
    navigator.clipboard.writeText(text)
    setAllCopied(true)
    setTimeout(() => setAllCopied(false), 2000)
  }

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="text-blue-400/70"
          >
            <rect x="1" y="2.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1 4l5 3.5L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-blue-400/80">
            Email Draft #{draft.id}
          </span>
        </div>
        <button
          onClick={copyAll}
          className={cn(
            'rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all',
            allCopied
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-blue-500/10 text-blue-400/70 hover:bg-blue-500/20 hover:text-blue-400'
          )}
        >
          {allCopied ? '✓ Copied' : 'Copy All'}
        </button>
      </div>

      {/* To */}
      <div className="mb-1.5 flex items-start gap-3 rounded-lg bg-surface/50 px-3 py-2">
        <span className="mt-0.5 w-10 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
          To
        </span>
        <span className="flex-1 text-xs text-foreground/80">{draft.to_field}</span>
        <CopyButton text={draft.to_field} label="Copy" />
      </div>

      {/* Subject */}
      <div className="mb-3 flex items-start gap-3 rounded-lg bg-surface/50 px-3 py-2">
        <span className="mt-0.5 w-10 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
          Subj
        </span>
        <span className="flex-1 text-xs font-semibold text-foreground">{draft.subject}</span>
        <CopyButton text={draft.subject} label="Copy" />
      </div>

      {/* Body */}
      <div className="rounded-lg border border-border/40 bg-surface/30">
        <div className="flex items-center justify-between border-b border-border/30 px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
            Body
          </span>
          <div className="flex items-center gap-3">
            <CopyButton text={draft.body} label="Copy" />
            <button
              onClick={() => setBodyExpanded((v) => !v)}
              className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/30 transition-colors hover:text-muted-foreground/60"
            >
              {bodyExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        {bodyExpanded && (
          <pre className="max-h-52 overflow-y-auto px-3 py-2.5 font-sans text-xs leading-relaxed text-foreground/75 whitespace-pre-wrap">
            {draft.body}
          </pre>
        )}
      </div>
    </div>
  )
}
