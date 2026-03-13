import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { emailDraftsApi, type EmailDraft, type EmailDraftUpdate } from '@/lib/api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className={cn(
        'font-mono text-[10px] uppercase tracking-wider transition-colors',
        copied ? 'text-emerald-400' : 'text-muted-foreground/40 hover:text-muted-foreground'
      )}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}

// ── Compact draft row (sidebar) ───────────────────────────────────────────

function CompactDraftRow({ draft }: { draft: EmailDraft }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const deleteDraft = useMutation({
    mutationFn: () => emailDraftsApi.delete(draft.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] }),
  })

  const copyAll = () => {
    navigator.clipboard.writeText(
      `To: ${draft.to_field}\nSubject: ${draft.subject}\n\n${draft.body}`
    )
  }

  return (
    <div className="border-b border-border/60 last:border-0">
      <div
        className={cn(
          'flex cursor-pointer items-start gap-2 px-3 py-2.5 transition-colors hover:bg-surface-2',
          expanded && 'bg-surface-2'
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-snug">{draft.subject}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
            To: {draft.to_field}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground/35">
            {formatDate(draft.updated_at)}
          </p>
        </div>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          className={cn(
            'mt-1 shrink-0 text-muted-foreground/30 transition-transform',
            expanded && 'rotate-180'
          )}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {expanded && (
        <div className="border-t border-border/40 bg-surface-2 px-3 pb-3 pt-2.5">
          <div className="rounded border border-border/40 bg-surface px-2.5 py-2">
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/75">
              {draft.body}
            </pre>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); copyAll() }}
              className="rounded bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-primary hover:bg-primary/20"
            >
              Copy
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteDraft.mutate() }}
              className="text-[9px] font-semibold uppercase text-muted-foreground/40 hover:text-red-400"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Full draft row (manual mode) ─────────────────────────────────────────

function DraftRow({ draft }: { draft: EmailDraft }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTo, setEditTo] = useState(draft.to_field)
  const [editSubject, setEditSubject] = useState(draft.subject)
  const [editBody, setEditBody] = useState(draft.body)

  const updateDraft = useMutation({
    mutationFn: (data: EmailDraftUpdate) => emailDraftsApi.update(draft.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drafts'] })
      setEditing(false)
    },
  })

  const deleteDraft = useMutation({
    mutationFn: () => emailDraftsApi.delete(draft.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] }),
  })

  const saveEdits = () => {
    updateDraft.mutate({ to_field: editTo, subject: editSubject, body: editBody })
  }

  const copyAll = () => {
    navigator.clipboard.writeText(`To: ${draft.to_field}\nSubject: ${draft.subject}\n\n${draft.body}`)
  }

  return (
    <div className="rounded-lg border border-border bg-surface transition-all hover:border-border/60">
      {/* Summary row */}
      <div
        className="flex cursor-pointer items-start gap-3 p-4"
        onClick={() => { setExpanded((v) => !v); setEditing(false) }}
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-blue-400/70">
            <rect x="1" y="2.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
            <path d="M1 4l5 3.5L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{draft.subject}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">To: {draft.to_field}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[10px] text-muted-foreground/40">
            {formatDate(draft.updated_at)}
          </span>
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className={cn('shrink-0 text-muted-foreground/30 transition-transform', expanded && 'rotate-180')}
          >
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="animate-fade-up border-t border-border/40 px-4 pb-4 pt-3">
          {editing ? (
            /* Edit mode */
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                  To
                </label>
                <input
                  value={editTo}
                  onChange={(e) => setEditTo(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs outline-none focus:border-primary/40"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                  Subject
                </label>
                <input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-semibold outline-none focus:border-primary/40"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                  Body
                </label>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed outline-none focus:border-primary/40"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdits}
                  disabled={updateDraft.isPending}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            /* Read mode */
            <>
              <div className="mb-2 space-y-1">
                <div className="flex gap-3 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 mt-0.5">To</span>
                  <span className="flex-1 text-xs">{draft.to_field}</span>
                </div>
                <div className="flex gap-3 rounded-lg bg-surface-2 px-3 py-2">
                  <span className="w-12 shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 mt-0.5">Subj</span>
                  <span className="flex-1 text-xs font-semibold">{draft.subject}</span>
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-surface-2 px-3 py-2.5">
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground/75">
                  {draft.body}
                </pre>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={copyAll}
                  className="rounded-lg border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
                >
                  Copy All
                </button>
                <CopyButton text={draft.body} label="Copy Body" />
                <div className="ml-auto flex items-center gap-3">
                  <button
                    onClick={() => setEditing(true)}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50 transition-colors hover:text-foreground"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteDraft.mutate()}
                    className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmailView({ compact }: { compact?: boolean }) {
  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ['drafts'],
    queryFn: emailDraftsApi.list,
    refetchInterval: 10_000,
  })

  if (compact) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b border-border px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Drafts
          </span>
          {drafts.length > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/40">
              {drafts.length}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border border-primary border-t-transparent" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-muted-foreground/20">
                <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 7l8 5.5L18 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <p className="text-[10px] text-muted-foreground/30">No drafts yet</p>
            </div>
          ) : (
            drafts.map((draft) => (
              <CompactDraftRow key={draft.id} draft={draft} />
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border border-primary border-t-transparent" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-muted-foreground/30">
              <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M2 7l8 5.5L18 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground/40">No email drafts yet</p>
          <p className="max-w-xs text-center text-[11px] text-muted-foreground/25">
            Ask the AI to draft an email — it will appear here for review and copying.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} />
          ))}
        </div>
      )}
    </div>
  )
}
