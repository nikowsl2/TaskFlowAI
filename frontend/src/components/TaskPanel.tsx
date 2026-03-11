import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/api'
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from '@/hooks/useTasks'

type Mode = 'manual' | 'compact'
type Filter = 'all' | 'active' | 'done' | 'high'

const PRIORITY_DOT: Record<string, string> = {
  high: 'dot-high',
  medium: 'dot-medium',
  low: 'dot-low',
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'H',
  medium: 'M',
  low: 'L',
}

// ── Compact item (AI sidebar mode) ───────────────────────────────────────────

function CompactTaskItem({ task }: { task: Task }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  return (
    <div className="group">
      <div className="flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors hover:bg-surface-2">
        <button
          onClick={() => updateTask.mutate({ id: task.id, data: { completed: !task.completed } })}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-all',
            task.completed
              ? 'border-primary/50 bg-primary/20 text-primary'
              : 'border-border text-transparent hover:border-primary/50'
          )}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span className={cn('flex-1 truncate text-xs', task.completed && 'text-muted-foreground line-through')}>
          {task.title}
        </span>

        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[task.priority])} />

        <button
          onClick={() => deleteTask.mutate(task.id)}
          className="shrink-0 text-muted-foreground/0 transition-all group-hover:text-muted-foreground hover:!text-red-400"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {task.subtasks?.map((sub) => (
        <div key={sub.id} className="ml-4 border-l border-border/50 pl-2">
          <CompactTaskItem task={sub} />
        </div>
      ))}
    </div>
  )
}

// ── Full task card (manual mode) ─────────────────────────────────────────────

function TaskCard({ task }: { task: Task }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-border bg-surface p-3.5 transition-all hover:border-border/80 hover:bg-surface-2',
        task.completed && 'opacity-60'
      )}
    >
      {/* Priority stripe */}
      <div className={cn('absolute left-0 top-3.5 bottom-3.5 w-0.5 rounded-full', PRIORITY_DOT[task.priority])} />

      <div className="ml-3 flex items-start gap-3">
        <button
          onClick={() => updateTask.mutate({ id: task.id, data: { completed: !task.completed } })}
          className={cn(
            'mt-0.5 flex h-4.5 h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-all',
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
          <p className={cn('text-sm font-500 leading-snug', task.completed && 'line-through text-muted-foreground')}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{task.description}</p>
          )}
          {task.due_date && (
            <p className="mt-1.5 font-mono text-[10px] text-primary/60">
              DUE {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] font-500 tracking-wider text-muted-foreground/60">
            {PRIORITY_LABEL[task.priority]}
          </span>
          <button
            onClick={() => deleteTask.mutate(task.id)}
            className="text-muted-foreground/0 transition-all group-hover:text-muted-foreground/40 hover:!text-red-400"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {task.subtasks?.length > 0 && (
        <div className="ml-7 mt-2 space-y-1.5 border-l border-border/40 pl-3 pt-1">
          {task.subtasks.map((sub) => (
            <TaskCard key={sub.id} task={sub} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────────────────────

function AddTaskForm({ onClose, compact }: { onClose: () => void; compact?: boolean }) {
  const createTask = useCreateTask()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createTask.mutate(
      { title: title.trim(), description: description.trim() || undefined, priority },
      { onSuccess: () => { setTitle(''); setDescription(''); onClose() } }
    )
  }

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="animate-fade-up px-2 pb-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title..."
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          className="w-full rounded border border-primary/40 bg-surface-2 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50 focus:border-primary/70"
        />
        <div className="mt-1.5 flex gap-1.5">
          {(['low', 'medium', 'high'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                'flex-1 rounded py-1 font-mono text-[10px] uppercase tracking-wider transition-all',
                priority === p
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p[0]}
            </button>
          ))}
          <button type="submit" className="rounded bg-primary px-2 py-1 font-mono text-[10px] font-500 text-primary-foreground">
            ↵
          </button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="animate-fade-up rounded-lg border border-primary/30 bg-surface p-4">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="w-full bg-transparent text-sm font-500 outline-none placeholder:text-muted-foreground/40 focus:placeholder:text-muted-foreground/20"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="mt-2 w-full resize-none bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/30"
      />
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Priority</span>
        <div className="flex gap-1">
          {(['low', 'medium', 'high'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                'rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all',
                priority === p
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            className="rounded bg-primary px-4 py-1 text-xs font-600 text-primary-foreground disabled:opacity-40"
          >
            Add Task
          </button>
        </div>
      </div>
    </form>
  )
}

// ── TaskPanel ─────────────────────────────────────────────────────────────────

export default function TaskPanel({ mode }: { mode: Mode }) {
  const { data: tasks = [], isLoading } = useTasks()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = tasks.filter((t) => {
    if (filter === 'active') return !t.completed
    if (filter === 'done') return t.completed
    if (filter === 'high') return t.priority === 'high'
    return true
  })

  const total = tasks.length
  const done = tasks.filter((t) => t.completed).length
  const progress = total > 0 ? Math.round((done / total) * 100) : 0

  // ── COMPACT MODE (AI sidebar) ──────────────────────────────────────────────
  if (mode === 'compact') {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-500 uppercase tracking-[0.12em] text-muted-foreground">
              Tasks
            </span>
            <button
              onClick={() => setAdding((v) => !v)}
              className="font-mono text-[10px] text-primary hover:text-primary/80"
            >
              + NEW
            </button>
          </div>
          {total > 0 && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between font-mono text-[9px] text-muted-foreground/50">
                <span>{done}/{total}</span>
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
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {adding && <AddTaskForm onClose={() => setAdding(false)} compact />}
          {isLoading ? (
            <div className="mt-4 flex justify-center">
              <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="mt-6 text-center font-mono text-[10px] text-muted-foreground/40">
              no tasks yet
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((task) => (
                <CompactTaskItem key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── MANUAL MODE (full) ─────────────────────────────────────────────────────
  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'done', label: 'Done' },
    { key: 'high', label: 'Priority' },
  ]

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-800 tracking-tight">Task Board</h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {done} of {total} completed
            </p>
          </div>
          <button
            onClick={() => setAdding((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-600 transition-all',
              adding
                ? 'bg-surface-2 text-muted-foreground'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
          >
            <span className="text-base leading-none">{adding ? '−' : '+'}</span>
            {adding ? 'Cancel' : 'New Task'}
          </button>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mt-4">
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Filters */}
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
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-500 transition-all',
                  filter === key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
                <span className={cn(
                  'font-mono text-[10px]',
                  filter === key ? 'text-primary/70' : 'text-muted-foreground/50'
                )}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Task list */}
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
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
