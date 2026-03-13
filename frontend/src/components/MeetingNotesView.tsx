import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { meetingApi, notesApi, type MeetingNote, type TaskCandidate } from '@/lib/api'
import { useCreateTask } from '@/hooks/useTasks'

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowLocalISO() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:MM" for datetime-local input
}

function fmtMeetingTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  index,
  onAdd,
  onDismiss,
}: {
  candidate: TaskCandidate
  index: number
  onAdd: (c: TaskCandidate) => void
  onDismiss: () => void
}) {
  const [title, setTitle] = useState(candidate.title)
  const [description, setDescription] = useState(candidate.description ?? '')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(candidate.priority)
  const [dueDate, setDueDate] = useState(candidate.due_date ?? '')

  return (
    <div className="animate-fade-up rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
          Candidate {index + 1}
        </span>
        <button
          onClick={onDismiss}
          className="text-muted-foreground/30 transition-colors hover:text-muted-foreground"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        className="mb-2 w-full rounded border border-border/60 bg-surface-2 px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus:border-primary/40 placeholder:text-muted-foreground/30"
      />

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="mb-3 w-full resize-none rounded border border-border/60 bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground outline-none transition-colors focus:border-primary/40 placeholder:text-muted-foreground/30"
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Priority</span>
          <div className="flex rounded border border-border/60 p-0.5">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all',
                  priority === p ? 'bg-primary/20 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Due</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-border/60 bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-muted-foreground outline-none [color-scheme:dark]"
          />
        </div>
      </div>

      <button
        onClick={() => onAdd({ title: title.trim(), description: description.trim() || null, priority, due_date: dueDate || null })}
        disabled={!title.trim()}
        className="w-full rounded-lg bg-primary py-1.5 text-xs font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40"
      >
        Add to Board
      </button>
    </div>
  )
}

// ── Compact candidate card (sidebar) ──────────────────────────────────────

function CompactCandidateCard({
  candidate,
  onAdd,
  onDismiss,
}: {
  candidate: TaskCandidate
  onAdd: () => void
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{candidate.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', {
            'dot-high': candidate.priority === 'high',
            'dot-medium': candidate.priority === 'medium',
            'dot-low': candidate.priority === 'low',
          })} />
          <span className="text-[9px] text-muted-foreground/50 uppercase">{candidate.priority}</span>
        </div>
      </div>
      <button
        onClick={onAdd}
        className="shrink-0 rounded bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary hover:bg-primary/25"
      >
        Add
      </button>
      <button
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

// ── Compact save button (sidebar) ─────────────────────────────────────────

function CompactSaveButton({
  title,
  summary,
  content,
}: {
  title: string
  summary: string
  content: string
}) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      notesApi.create({
        title,
        summary,
        content,
        meeting_time: new Date().toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting-notes'] })
      setSaved(true)
    },
  })

  if (saved) {
    return (
      <div className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-emerald-400">
          <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[10px] font-semibold text-emerald-400">Saved</span>
      </div>
    )
  }

  return (
    <button
      onClick={() => save.mutate()}
      disabled={save.isPending}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/30 py-2 text-[10px] font-bold text-primary transition-all hover:bg-primary/10 disabled:opacity-40"
    >
      {save.isPending && (
        <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
      )}
      Save Note
    </button>
  )
}

// ── Save panel ────────────────────────────────────────────────────────────────

function SaveNotePanel({
  initialTitle,
  initialSummary,
  content,
  onSaved,
}: {
  initialTitle: string
  initialSummary: string
  content: string
  onSaved: (note: MeetingNote) => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(initialTitle)
  const [summary, setSummary] = useState(initialSummary)
  const [meetingTime, setMeetingTime] = useState(nowLocalISO())
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () =>
      notesApi.create({ title, summary, content, meeting_time: new Date(meetingTime).toISOString() }),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ['meeting-notes'] })
      setSaved(true)
      onSaved(note)
    },
  })

  if (saved) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-emerald-400">
          <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-xs text-emerald-400">Note saved to archive</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
        Save Note to Archive
      </p>

      <div className="mb-2.5">
        <label className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded border border-border/60 bg-surface-2 px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus:border-primary/40"
        />
      </div>

      <div className="mb-2.5">
        <label className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={3}
          className="w-full resize-none rounded border border-border/60 bg-surface-2 px-3 py-1.5 text-xs leading-relaxed text-muted-foreground outline-none transition-colors focus:border-primary/40"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Meeting Time</label>
        <input
          type="datetime-local"
          value={meetingTime}
          onChange={(e) => setMeetingTime(e.target.value)}
          className="rounded border border-border/60 bg-surface-2 px-3 py-1.5 font-mono text-xs text-muted-foreground outline-none transition-colors focus:border-primary/40 [color-scheme:dark]"
        />
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={!title.trim() || save.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 py-2 text-xs font-bold text-primary transition-all hover:bg-primary/10 disabled:opacity-40"
      >
        {save.isPending && (
          <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
        )}
        Save Note
      </button>
    </div>
  )
}

// ── Saved notes list ──────────────────────────────────────────────────────────

function SavedNotesList({ onBack, compact }: { onBack: () => void; compact?: boolean }) {
  const qc = useQueryClient()
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['meeting-notes'],
    queryFn: notesApi.list,
  })
  const [expanded, setExpanded] = useState<number | null>(null)

  const del = useMutation({
    mutationFn: (id: number) => notesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting-notes'] }),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className={cn(
        'flex items-center justify-between border-b border-border py-2.5',
        compact ? 'px-3' : 'px-6'
      )}>
        <span className={cn(
          'uppercase text-muted-foreground/50',
          compact
            ? 'text-[10px] font-semibold tracking-wide'
            : 'font-mono text-[10px] tracking-widest'
        )}>
          {notes.length} saved {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <button
          onClick={onBack}
          className={cn(
            'uppercase text-muted-foreground/40 transition-colors hover:text-muted-foreground',
            compact
              ? 'text-[10px] font-semibold tracking-wide'
              : 'font-mono text-[10px] tracking-wider'
          )}
        >
          ← Back
        </button>
      </div>

      <div className={cn('flex-1 overflow-y-auto py-3', compact ? 'px-3' : 'px-6 py-5')}>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border border-primary border-t-transparent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
            <p className="text-xs text-muted-foreground/40">
              {compact ? 'No notes yet' : 'No saved notes yet'}
            </p>
          </div>
        ) : (
          <div className={cn('space-y-2', !compact && 'mx-auto max-w-2xl')}>
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-surface">
                <div
                  className={cn(
                    'flex cursor-pointer items-start gap-2 hover:bg-surface-2',
                    compact ? 'px-3 py-2' : 'px-4 py-3 gap-3'
                  )}
                  onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      'font-semibold leading-snug',
                      compact ? 'text-xs' : 'text-sm'
                    )}>{note.title}</p>
                    <p className={cn(
                      'mt-0.5 text-[10px] text-muted-foreground/50',
                      !compact && 'font-mono'
                    )}>
                      {fmtMeetingTime(note.meeting_time)}
                    </p>
                  </div>
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className={cn('mt-1 shrink-0 text-muted-foreground/30 transition-transform', expanded === note.id && 'rotate-180')}
                  >
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {expanded === note.id && (
                  <div className={cn(
                    'border-t border-border/50',
                    compact ? 'px-3 pb-3 pt-2.5' : 'px-4 pb-4 pt-3'
                  )}>
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{note.summary}</p>
                    {!compact && (
                      <details className="group">
                        <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 hover:text-muted-foreground/60">
                          Original notes
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded border border-border/40 bg-surface-2 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground/60">
                          {note.content}
                        </pre>
                      </details>
                    )}
                    <button
                      onClick={() => { del.mutate(note.id); setExpanded(null) }}
                      className={cn(
                        'mt-3 uppercase text-muted-foreground/30 transition-colors hover:text-red-400',
                        compact
                          ? 'text-[10px] font-semibold tracking-wide'
                          : 'font-mono text-[10px] tracking-wider'
                      )}
                    >
                      {compact ? 'Delete' : 'Delete note'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

type Phase = 'input' | 'results' | 'saved-list'

export default function MeetingNotesView({ compact }: { compact?: boolean }) {
  const createTask = useCreateTask()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('input')
  const [notes, setNotes] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extractedTitle, setExtractedTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [candidates, setCandidates] = useState<TaskCandidate[]>([])
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set())
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setError(null)
    try {
      const { text } = await meetingApi.parseFile(file)
      setNotes(text)
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setError(detail ?? 'Could not read file')
      setFileName(null)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleGenerate = async () => {
    if (!notes.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await meetingApi.extract(notes)
      setExtractedTitle(result.title)
      setSummary(result.summary)
      setCandidates(result.candidates)
      setDismissedIds(new Set())
      setPhase('results')
    } catch (err: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (err as any)?.response?.data?.detail
      setError(detail ?? 'Failed to process notes. Check your API key and backend connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdd = (index: number, candidate: TaskCandidate) => {
    createTask.mutate({
      title: candidate.title,
      description: candidate.description ?? undefined,
      priority: candidate.priority,
      due_date: candidate.due_date ? `${candidate.due_date}T00:00:00` : undefined,
    })
    setDismissedIds((prev) => new Set([...prev, index]))
  }

  const handleAddAll = () => {
    candidates.forEach((c, i) => {
      if (!dismissedIds.has(i)) handleAdd(i, c)
    })
  }

  const handleReset = () => {
    setPhase('input')
    setNotes('')
    setFileName(null)
    setSummary('')
    setExtractedTitle('')
    setCandidates([])
    setDismissedIds(new Set())
    setError(null)
  }

  const visibleCandidates = candidates.filter((_, i) => !dismissedIds.has(i))

  // ── SAVED NOTES LIST ──────────────────────────────────────────────────────
  if (phase === 'saved-list') {
    return <SavedNotesList onBack={() => setPhase('input')} compact={compact} />
  }

  // ── INPUT PHASE ────────────────────────────────────────────────────────────
  if (phase === 'input') {
    return (
      <div className={cn(
        'flex flex-1 flex-col overflow-y-auto',
        compact ? 'px-3 py-4' : 'px-6 py-6'
      )}>
        <div className={cn('w-full', !compact && 'mx-auto max-w-2xl')}>
          {/* Saved notes link */}
          <div className={cn(compact ? 'mb-4 flex justify-center' : 'mb-5 flex justify-end')}>
            <button
              onClick={() => setPhase('saved-list')}
              className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect x="1" y="2" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3 5h5M3 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              {compact ? 'Saved' : 'Saved Notes'}
            </button>
          </div>

          {/* Textarea */}
          <div className={compact ? 'mb-3' : 'mb-4'}>
            <label className={cn(
              'mb-1.5 block uppercase text-muted-foreground/50',
              compact
                ? 'text-[10px] font-semibold tracking-wide text-center'
                : 'font-mono text-[10px] tracking-widest'
            )}>
              {compact ? 'Paste Notes' : 'Paste Meeting Notes'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={compact
                ? 'Paste notes here…'
                : `Paste your raw meeting notes here...\n\ne.g. "Need to finish slides by Friday. Alex will send the proposal ASAP. Team sync next Monday at 10am."`
              }
              rows={compact ? 5 : 10}
              className={cn(
                'w-full resize-none rounded-lg border border-border bg-surface py-3 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-primary/40 placeholder:text-muted-foreground/25',
                compact ? 'px-3 text-xs' : 'px-4'
              )}
            />
          </div>

          {/* File upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all',
              compact ? 'mb-4 gap-1.5 py-3' : 'mb-5 gap-2 py-5',
              isDragging ? 'border-primary/60 bg-primary/5' : 'border-border/50 hover:border-border hover:bg-surface'
            )}
          >
            <svg width={compact ? '16' : '20'} height={compact ? '16' : '20'} viewBox="0 0 20 20" fill="none" className="text-muted-foreground/30">
              <path d="M10 13V4M10 4l-3 3M10 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {fileName ? (
              <span className={cn(
                'text-primary',
                compact ? 'text-[10px] font-semibold' : 'font-mono text-[11px]'
              )}>{fileName}</span>
            ) : (
              <span className={cn(
                'text-muted-foreground/40',
                compact ? 'text-[10px]' : 'font-mono text-[10px]'
              )}>
                {compact ? '.txt / .docx / .pdf' : 'Upload .txt or .docx · drag & drop or click'}
              </span>
            )}
            <input ref={fileInputRef} type="file" accept=".txt,.docx,.doc" onChange={handleFileInput} className="hidden" />
          </div>

          {error && (
            <p className={cn(
              'rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400',
              compact ? 'mb-3 px-3 py-2' : 'mb-4 px-4 py-2.5'
            )}>
              {error}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={!notes.trim() || isLoading}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg bg-primary font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40',
              compact ? 'py-2 text-xs' : 'py-3 text-sm'
            )}
          >
            {isLoading ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border border-primary-foreground border-t-transparent" />
                {compact ? 'Extracting…' : 'Extracting tasks & summary…'}
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1l1.5 4H13l-3.5 2.5 1.5 4L7 9 3 11.5l1.5-4L1 5h4.5L7 1z" fill="currentColor" />
                </svg>
                {compact ? 'Generate' : 'Generate Summary & Task Candidates'}
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── RESULTS PHASE ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className={cn(
        'flex items-center justify-between border-b border-border py-2.5',
        compact ? 'px-3' : 'px-6'
      )}>
        <span className={cn(
          'uppercase text-muted-foreground/50',
          compact
            ? 'text-[10px] font-semibold tracking-wide'
            : 'font-mono text-[10px] tracking-widest'
        )}>
          {compact
            ? `${candidates.length} found`
            : `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} found`}
        </span>
        <div className="flex items-center gap-3">
          {visibleCandidates.length > 1 && (
            <button
              onClick={handleAddAll}
              className={cn(
                'rounded-lg bg-primary/10 text-primary transition-all hover:bg-primary/20',
                compact
                  ? 'px-2 py-0.5 text-[10px] font-semibold'
                  : 'px-3 py-1 font-mono text-[10px]'
              )}
            >
              {compact ? 'Add All' : 'Add All Remaining'}
            </button>
          )}
          <button
            onClick={handleReset}
            className={cn(
              'uppercase text-muted-foreground/40 transition-colors hover:text-muted-foreground',
              compact
                ? 'text-[10px] font-semibold tracking-wide'
                : 'font-mono text-[10px] tracking-wider'
            )}
          >
            {compact ? '← Back' : '← New Notes'}
          </button>
        </div>
      </div>

      <div className={cn('flex-1 overflow-y-auto py-4', compact ? 'px-3' : 'px-6 py-5')}>
        <div className={cn('space-y-4', !compact && 'mx-auto max-w-2xl space-y-5')}>
          {/* Summary */}
          <div>
            <p className={cn(
              'mb-2 uppercase text-muted-foreground/40',
              compact
                ? 'text-[10px] font-semibold tracking-wide text-center'
                : 'font-mono text-[10px] tracking-widest'
            )}>
              {compact ? 'Summary' : 'Meeting Summary'}
            </p>
            <div className={cn(
              'rounded-lg border border-border bg-surface py-3',
              compact ? 'px-3' : 'px-4 py-3.5'
            )}>
              <p className={cn(
                'leading-relaxed text-foreground',
                compact ? 'text-xs' : 'text-sm'
              )}>{summary}</p>
            </div>
          </div>

          {/* Save panel */}
          {compact ? (
            <CompactSaveButton
              title={extractedTitle}
              summary={summary}
              content={notes}
            />
          ) : (
            <SaveNotePanel
              initialTitle={extractedTitle}
              initialSummary={summary}
              content={notes}
              onSaved={() => { }}
            />
          )}

          {/* Task candidates */}
          {candidates.length > 0 && (
            <div>
              <p className={cn(
                'uppercase text-muted-foreground/40',
                compact
                  ? 'mb-2 text-[10px] font-semibold tracking-wide text-center'
                  : 'mb-3 font-mono text-[10px] tracking-widest'
              )}>
                {compact ? 'Tasks' : 'Task Candidates'}
              </p>
              {visibleCandidates.length === 0 ? (
                <div className={cn(
                  'flex flex-col items-center justify-center gap-2',
                  compact ? 'py-6' : 'py-10'
                )}>
                  <div className="font-mono text-2xl text-muted-foreground/15">✓</div>
                  <p className="text-xs text-muted-foreground/40">
                    {compact ? 'All added' : 'All candidates added to your board'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {candidates.map((c, i) =>
                    dismissedIds.has(i) ? null : (
                      compact ? (
                        <CompactCandidateCard
                          key={i}
                          candidate={c}
                          onAdd={() => handleAdd(i, c)}
                          onDismiss={() => setDismissedIds((prev) => new Set([...prev, i]))}
                        />
                      ) : (
                        <CandidateCard
                          key={i}
                          candidate={c}
                          index={i}
                          onAdd={(edited) => handleAdd(i, edited)}
                          onDismiss={() => setDismissedIds((prev) => new Set([...prev, i]))}
                        />
                      )
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {candidates.length === 0 && (
            <div className={cn(
              'flex flex-col items-center justify-center gap-2',
              compact ? 'py-8' : 'py-10'
            )}>
              <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
              <p className="text-xs text-muted-foreground/40">
                {compact ? 'No action items found' : 'No action items detected in these notes'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
