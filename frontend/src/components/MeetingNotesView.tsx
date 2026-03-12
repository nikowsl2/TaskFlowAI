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
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
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
        {save.isPending ? (
          <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5L4.5 9 10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        Save Note
      </button>
    </div>
  )
}

// ── Saved notes list ──────────────────────────────────────────────────────────

function SavedNotesList({ onBack }: { onBack: () => void }) {
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
      <div className="flex items-center justify-between border-b border-border px-6 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
          {notes.length} saved {notes.length === 1 ? 'note' : 'notes'}
        </span>
        <button
          onClick={onBack}
          className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground"
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border border-primary border-t-transparent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
            <p className="text-xs text-muted-foreground/40">No saved notes yet</p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-surface">
                {/* Header row */}
                <div
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface-2"
                  onClick={() => setExpanded(expanded === note.id ? null : note.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug">{note.title}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/50">
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

                {/* Expanded */}
                {expanded === note.id && (
                  <div className="border-t border-border/50 px-4 pb-4 pt-3">
                    <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{note.summary}</p>
                    <details className="group">
                      <summary className="cursor-pointer font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 hover:text-muted-foreground/60">
                        Original notes
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded border border-border/40 bg-surface-2 px-3 py-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground/60">
                        {note.content}
                      </pre>
                    </details>
                    <button
                      onClick={() => { del.mutate(note.id); setExpanded(null) }}
                      className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/30 transition-colors hover:text-red-400"
                    >
                      Delete note
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

export default function MeetingNotesView() {
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
    return <SavedNotesList onBack={() => setPhase('input')} />
  }

  // ── INPUT PHASE ────────────────────────────────────────────────────────────
  if (phase === 'input') {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-2xl">
          {/* Saved notes link */}
          <div className="mb-5 flex justify-end">
            <button
              onClick={() => setPhase('saved-list')}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect x="1" y="2" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3 5h5M3 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Saved Notes
            </button>
          </div>

          {/* Textarea */}
          <div className="mb-4">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
              Paste Meeting Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`Paste your raw meeting notes here...\n\ne.g. "Need to finish slides by Friday. Alex will send the proposal ASAP. Team sync next Monday at 10am."`}
              rows={10}
              className="w-full resize-none rounded-lg border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-primary/40 placeholder:text-muted-foreground/25"
            />
          </div>

          {/* File upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'mb-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-5 transition-all',
              isDragging ? 'border-primary/60 bg-primary/5' : 'border-border/50 hover:border-border hover:bg-surface'
            )}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-muted-foreground/30">
              <path d="M10 13V4M10 4l-3 3M10 4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {fileName ? (
              <span className="font-mono text-[11px] text-primary">{fileName}</span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground/40">
                Upload .txt or .docx · drag &amp; drop or click
              </span>
            )}
            <input ref={fileInputRef} type="file" accept=".txt,.docx,.doc" onChange={handleFileInput} className="hidden" />
          </div>

          {error && (
            <p className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-xs text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleGenerate}
            disabled={!notes.trim() || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40"
          >
            {isLoading ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border border-primary-foreground border-t-transparent" />
                Extracting tasks &amp; summary…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1l1.5 4H13l-3.5 2.5 1.5 4L7 9 3 11.5l1.5-4L1 5h4.5L7 1z" fill="currentColor" />
                </svg>
                Generate Summary &amp; Task Candidates
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
      <div className="flex items-center justify-between border-b border-border px-6 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
          {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} found
        </span>
        <div className="flex items-center gap-3">
          {visibleCandidates.length > 1 && (
            <button
              onClick={handleAddAll}
              className="rounded-lg bg-primary/10 px-3 py-1 font-mono text-[10px] text-primary transition-all hover:bg-primary/20"
            >
              Add All Remaining
            </button>
          )}
          <button
            onClick={handleReset}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          >
            ← New Notes
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-2xl space-y-5">
          {/* Summary */}
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
              Meeting Summary
            </p>
            <div className="rounded-lg border border-border bg-surface px-4 py-3.5">
              <p className="text-sm leading-relaxed text-foreground">{summary}</p>
            </div>
          </div>

          {/* Save panel */}
          <SaveNotePanel
            initialTitle={extractedTitle}
            initialSummary={summary}
            content={notes}
            onSaved={() => {}}
          />

          {/* Task candidates */}
          {candidates.length > 0 && (
            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40">
                Task Candidates
              </p>
              {visibleCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10">
                  <div className="font-mono text-2xl text-muted-foreground/15">✓</div>
                  <p className="text-xs text-muted-foreground/40">All candidates added to your board</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((c, i) =>
                    dismissedIds.has(i) ? null : (
                      <CandidateCard
                        key={i}
                        candidate={c}
                        index={i}
                        onAdd={(edited) => handleAdd(i, edited)}
                        onDismiss={() => setDismissedIds((prev) => new Set([...prev, i]))}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {candidates.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
              <p className="text-xs text-muted-foreground/40">No action items detected in these notes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
