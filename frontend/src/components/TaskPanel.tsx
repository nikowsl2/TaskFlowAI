import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/api'
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from '@/hooks/useTasks'
import CalendarView from './CalendarView'
import DocumentsView from './DocumentsView'
import EmailView from './EmailView'
import MeetingNotesView from './MeetingNotesView'
import { ProfileView } from './ProfileView'
import { ProjectsView } from './ProjectsView'

type Mode = 'manual' | 'menu'
type Filter = 'all' | 'active' | 'done' | 'high'
type View = 'list' | 'calendar' | 'notes' | 'email' | 'docs' | 'projects' | 'profile'

const PRIORITY_DOT: Record<string, string> = {
  high: 'dot-high',
  medium: 'dot-medium',
  low: 'dot-low',
}

// ── Shared: Add task form ─────────────────────────────────────────────────────

function AddTaskForm({ onClose, compact }: { onClose: () => void; compact?: boolean }) {
  const createTask = useCreateTask()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [dueDate, setDueDate] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createTask.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        due_date: dueDate ? `${dueDate}T00:00:00` : undefined,
      },
      { onSuccess: () => { setTitle(''); setDescription(''); setDueDate(''); onClose() } }
    )
  }

  if (compact) {
    return (
      <form onSubmit={submit} className="animate-fade-up border-b border-border px-3 py-2.5">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          placeholder="Task title…"
          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
        />
        <div className="mt-2 flex items-center gap-1.5">
          {(['low', 'medium', 'high'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-all',
                priority === p ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'
              )}
            >
              {p}
            </button>
          ))}
          <div className="ml-auto flex gap-1.5">
            <button type="button" onClick={onClose} className="font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground">
              esc
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground disabled:opacity-40"
            >
              add
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Due</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-border/60 bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground outline-none [color-scheme:dark]"
          />
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={submit} className="animate-fade-up rounded-lg border border-primary/30 bg-surface p-4">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        placeholder="Task title…"
        className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground/40"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="mt-2 w-full resize-none bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/30"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Priority</span>
        <div className="flex gap-1">
          {(['low', 'medium', 'high'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                'rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all',
                priority === p ? 'bg-primary/20 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Due</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded border border-border/60 bg-surface px-2 py-0.5 font-mono text-[10px] text-muted-foreground outline-none [color-scheme:dark]"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded bg-primary px-4 py-1 text-xs font-bold text-primary-foreground disabled:opacity-40"
          >
            Add Task
          </button>
        </div>
      </div>
    </form>
  )
}

// ── Menu mode: accordion task item ────────────────────────────────────────────

function MenuTaskItem({ task, expandedId, onExpand }: {
  task: Task
  expandedId: number | null
  onExpand: (id: number | null) => void
}) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const isOpen = expandedId === task.id

  return (
    <div className="border-b border-border/60 last:border-0">
      {/* Row */}
      <div
        className={cn(
          'flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-2',
          isOpen && 'bg-surface-2'
        )}
        onClick={() => onExpand(isOpen ? null : task.id)}
      >
        {/* Checkbox – stop propagation so clicking doesn't toggle accordion */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            updateTask.mutate({ id: task.id, data: { completed: !task.completed } })
          }}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all',
            task.completed
              ? 'border-primary/50 bg-primary/15 text-primary'
              : 'border-border text-transparent hover:border-primary/50'
          )}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span
          className={cn(
            'flex-1 truncate text-xs font-medium',
            task.completed && 'text-muted-foreground line-through'
          )}
        >
          {task.title}
        </span>

        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])} />

        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={cn('shrink-0 text-muted-foreground/40 transition-transform', isOpen && 'rotate-180')}
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Expanded details */}
      {isOpen && (
        <div className="animate-fade-up border-t border-border/40 bg-surface-2 px-4 pb-3 pt-2.5">
          {task.description && (
            <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">{task.description}</p>
          )}

          {/* Priority selector */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Priority</span>
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                onClick={() => updateTask.mutate({ id: task.id, data: { priority: p } })}
                className={cn(
                  'rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-all',
                  task.priority === p
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Due date */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">Due</span>
            <input
              type="date"
              defaultValue={task.due_date ? task.due_date.split('T')[0] : ''}
              onChange={(e) => {
                const val = e.target.value
                updateTask.mutate({ id: task.id, data: { due_date: val ? `${val}T00:00:00` : null } })
              }}
              className="rounded border border-border/60 bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground outline-none [color-scheme:dark]"
            />
          </div>

          {/* Delete */}
          <button
            onClick={() => {
              deleteTask.mutate(task.id)
              onExpand(null)
            }}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-red-400"
          >
            Delete task
          </button>
        </div>
      )}
    </div>
  )
}

// ── Manual mode: full task card ───────────────────────────────────────────────

function TaskCard({ task, highlighted }: { task: Task; highlighted?: boolean }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const ref = useRef<HTMLDivElement>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)
  const [descVal, setDescVal] = useState(task.description ?? '')

  // Sync with external updates (e.g. from AI agent)
  useEffect(() => { setTitleVal(task.title) }, [task.title])
  useEffect(() => { setDescVal(task.description ?? '') }, [task.description])

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlighted])

  const saveTitle = () => {
    setEditingTitle(false)
    const trimmed = titleVal.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask.mutate({ id: task.id, data: { title: trimmed } })
    } else {
      setTitleVal(task.title)
    }
  }

  const saveDesc = () => {
    setEditingDesc(false)
    const trimmed = descVal.trim()
    if (trimmed !== (task.description ?? '')) {
      updateTask.mutate({ id: task.id, data: { description: trimmed || undefined } })
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'group relative rounded-lg border border-border bg-surface p-4 transition-all hover:border-border/60 hover:bg-surface-2',
        task.completed && 'opacity-60',
        highlighted && 'ring-2 ring-primary/50 border-primary/40'
      )}
    >
      {/* Priority stripe */}
      <div className={cn('absolute left-0 top-4 bottom-4 w-0.5 rounded-full', PRIORITY_DOT[task.priority])} />

      <div className="ml-3.5 flex items-start gap-3">
        <button
          onClick={() => updateTask.mutate({ id: task.id, data: { completed: !task.completed } })}
          className={cn(
            'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-all',
            task.completed
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-border text-transparent hover:border-primary/60'
          )}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 4.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          {/* Title — click to edit */}
          {editingTitle ? (
            <input
              autoFocus
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') { setTitleVal(task.title); setEditingTitle(false) }
              }}
              className="w-full bg-transparent text-sm font-semibold leading-snug outline-none ring-1 ring-primary/40 rounded px-1 -ml-1"
            />
          ) : (
            <p
              onClick={() => !task.completed && setEditingTitle(true)}
              className={cn(
                'text-sm font-semibold leading-snug',
                task.completed ? 'line-through text-muted-foreground' : 'cursor-text hover:text-primary transition-colors'
              )}
            >
              {task.title}
            </p>
          )}

          {/* Description — click to edit (or click to add) */}
          {editingDesc ? (
            <textarea
              autoFocus
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setDescVal(task.description ?? ''); setEditingDesc(false) }
              }}
              rows={2}
              className="mt-1 w-full resize-none bg-transparent text-xs leading-relaxed text-muted-foreground outline-none ring-1 ring-primary/40 rounded px-1 -ml-1"
            />
          ) : (
            <p
              onClick={() => !task.completed && setEditingDesc(true)}
              className={cn(
                'mt-0.5 text-xs leading-relaxed',
                task.description
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/30 italic',
                !task.completed && 'cursor-text hover:text-muted-foreground/80 transition-colors'
              )}
            >
              {task.description || (task.completed ? '' : 'Add description…')}
            </p>
          )}

          {/* Due date + Priority controls — visible on hover */}
          <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Priority buttons */}
            <div className="flex items-center gap-1">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => updateTask.mutate({ id: task.id, data: { priority: p } })}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all',
                    task.priority === p
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground/30 hover:text-muted-foreground'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Due date picker */}
            <input
              type="date"
              value={task.due_date ? task.due_date.split('T')[0] : ''}
              onChange={(e) => {
                const val = e.target.value
                updateTask.mutate({ id: task.id, data: { due_date: val ? `${val}T00:00:00` : null } })
              }}
              className="rounded border border-border/60 bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground outline-none [color-scheme:dark]"
            />
          </div>

          {/* Due date display — always visible when set (hidden on hover when controls show) */}
          {task.due_date && (
            <p className="mt-1.5 font-mono text-[10px] text-primary/60 group-hover:hidden">
              DUE {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground/50 uppercase group-hover:hidden">
            {task.priority[0]}
          </span>
          <button
            onClick={() => deleteTask.mutate(task.id)}
            className="text-transparent transition-all group-hover:text-muted-foreground/40 hover:!text-red-400"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TaskPanel ─────────────────────────────────────────────────────────────────

export default function TaskPanel({
  mode,
  view,
  onViewChange,
}: {
  mode: Mode
  view: View
  onViewChange?: (v: View) => void
}) {
  const { data: tasks = [], isLoading } = useTasks()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null)

  const handleCalendarTaskClick = (taskId: number) => {
    setHighlightedTaskId(taskId)
    setFilter('all')
    onViewChange?.('list')
    // Clear highlight after animation
    setTimeout(() => setHighlightedTaskId(null), 2000)
  }

  const filtered = tasks.filter((t) => {
    if (filter === 'active') return !t.completed
    if (filter === 'done') return t.completed
    if (filter === 'high') return t.priority === 'high'
    return true
  })

  const total = tasks.length
  const done = tasks.filter((t) => t.completed).length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  // ── MENU MODE (AI sidebar) ────────────────────────────────────────────────
  const [sidebarTab, setSidebarTab] = useState<'tasks' | 'notes' | 'email' | 'docs' | 'projects' | 'profile'>('tasks')

  if (mode === 'menu') {
    return (
      <div className="flex h-full flex-col">
        {/* Sidebar tab selector */}
        <div className="border-b border-border px-2 py-2">
          <div className="flex flex-wrap gap-0.5">
            {([
              { key: 'tasks', label: 'Tasks' },
              { key: 'notes', label: 'Notes' },
              { key: 'email', label: 'Email' },
              { key: 'docs', label: 'Docs' },
              { key: 'projects', label: 'Projects' },
              { key: 'profile', label: 'Profile' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSidebarTab(tab.key)}
                className={cn(
                  'rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all',
                  sidebarTab === tab.key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground/50 hover:text-muted-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar content */}
        {sidebarTab === 'tasks' && (
          <>
            {/* Tasks header */}
            <div className="border-b border-border px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tasks
                </span>
                <button
                  onClick={() => setAdding((v) => !v)}
                  className="text-[10px] font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  {adding ? '✕ cancel' : '+ new'}
                </button>
              </div>

              {total > 0 && (
                <div className="mt-2">
                  <div className="mb-1 flex justify-between text-[10px] font-medium text-muted-foreground/50">
                    <span>{done}/{total} done</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-0.5 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              <div className="mt-2 flex gap-0.5">
                {(['all', 'active', 'done', 'high'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-all',
                      filter === f ? 'bg-primary/15 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Add form */}
            {adding && <AddTaskForm onClose={() => setAdding(false)} compact />}

            {/* Menu list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border border-primary border-t-transparent" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-muted-foreground/30">
                  {filter === 'all' ? 'no tasks yet' : `no ${filter} tasks`}
                </p>
              ) : (
                filtered.map((task) => (
                  <MenuTaskItem
                    key={task.id}
                    task={task}
                    expandedId={expandedId}
                    onExpand={setExpandedId}
                  />
                ))
              )}
            </div>
          </>
        )}

        {sidebarTab === 'notes' && (
          <div className="flex-1 overflow-y-auto">
            <MeetingNotesView compact />
          </div>
        )}

        {sidebarTab === 'email' && (
          <div className="flex-1 overflow-y-auto">
            <EmailView compact />
          </div>
        )}

        {sidebarTab === 'docs' && (
          <div className="flex-1 overflow-y-auto">
            <DocumentsView />
          </div>
        )}

        {sidebarTab === 'projects' && (
          <div className="flex-1 overflow-y-auto">
            <ProjectsView compact />
          </div>
        )}

        {sidebarTab === 'profile' && (
          <div className="flex-1 overflow-y-auto">
            <ProfileView compact />
          </div>
        )}
      </div>
    )
  }

  // ── MANUAL MODE (full board) ──────────────────────────────────────────────
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'done', label: 'Done' },
    { key: 'high', label: 'Priority' },
  ]

  const VIEW_TITLES: Record<View, string> = {
    list: 'Task Board',
    calendar: 'Task Board',
    notes: 'Meeting Notes',
    email: 'Email Drafts',
    docs: 'Documents',
    projects: 'Projects',
    profile: 'User Profile',
  }

  const VIEW_SUBTITLES: Record<View, string> = {
    list: `${done} of ${total} completed`,
    calendar: `${done} of ${total} completed`,
    notes: 'Extract tasks from your notes',
    email: 'AI-generated drafts ready to copy',
    docs: 'Upload and query your documents with AI',
    projects: 'Track project milestones and episodic memory',
    profile: 'Persistent context for the AI assistant',
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              {VIEW_TITLES[view]}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {VIEW_SUBTITLES[view]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {view === 'list' && (
              <button
                onClick={() => setAdding((v) => !v)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold transition-all',
                  adding ? 'bg-surface-2 text-muted-foreground' : 'bg-primary text-primary-foreground hover:opacity-90'
                )}
              >
                <span className="text-base leading-none">{adding ? '−' : '+'}</span>
                {adding ? 'Cancel' : 'New Task'}
              </button>
            )}
          </div>
        </div>

        {/* Progress + Filters — only in list view */}
        {view === 'list' && (
          <>
            {total > 0 && (
              <div className="mt-4">
                <div className="h-0.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
            <div className="mt-3 flex gap-1">
              {FILTERS.map(({ key, label }) => {
                const count =
                  key === 'all' ? total
                  : key === 'active' ? tasks.filter((t) => !t.completed).length
                  : key === 'done' ? done
                  : tasks.filter((t) => t.priority === 'high').length
                return (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all',
                      filter === key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {label}
                    <span className={cn('font-mono text-[10px]', filter === key ? 'text-primary/70' : 'text-muted-foreground/40')}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Calendar view */}
      {view === 'calendar' && <CalendarView onTaskClick={handleCalendarTaskClick} />}

      {/* Meeting notes view */}
      {view === 'notes' && <MeetingNotesView />}

      {/* Email drafts view */}
      {view === 'email' && <EmailView />}

      {/* Documents view */}
      {view === 'docs' && <DocumentsView />}

      {/* Projects view */}
      {view === 'projects' && (
        <div className="flex-1 overflow-y-auto">
          <ProjectsView />
        </div>
      )}

      {/* Profile view */}
      {view === 'profile' && (
        <div className="flex-1 overflow-y-auto">
          <ProfileView />
        </div>
      )}

      {/* Task list */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {adding && (
            <div className="mb-4">
              <AddTaskForm onClose={() => setAdding(false)} />
            </div>
          )}

          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <div className="font-mono text-2xl text-muted-foreground/20">∅</div>
              <p className="text-xs text-muted-foreground/40">
                {filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((task) => (
                <TaskCard key={task.id} task={task} highlighted={highlightedTaskId === task.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
