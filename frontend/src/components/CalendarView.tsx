import { useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useTasks, useUpdateTask } from '@/hooks/useTasks'
import type { Task } from '@/lib/api'

type Scale = 'day' | 'week' | 'month'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function parseTaskDate(iso: string): Date {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfWeek(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  r.setHours(0, 0, 0, 0)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...flattenTasks(t.subtasks ?? [])])
}

function tasksOnDay(tasks: Task[], day: Date): Task[] {
  return tasks.filter((t) => t.due_date && isSameDay(parseTaskDate(t.due_date), day))
}

const CHIP_CLS: Record<string, string> = {
  high: 'bg-red-500/15 text-red-400 border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
}

function TaskChip({ task }: { task: Task }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = task.due_date && !task.completed && parseTaskDate(task.due_date) < today
  return (
    <div
      className={cn(
        'truncate rounded border px-1.5 py-px font-mono text-[9px] leading-[1.4]',
        task.completed
          ? 'border-border/30 bg-transparent text-muted-foreground/40 line-through'
          : isOverdue
            ? 'border-red-500/30 bg-red-500/10 text-red-400'
            : CHIP_CLS[task.priority]
      )}
    >
      {task.title}
    </div>
  )
}

// ── MONTH VIEW ────────────────────────────────────────────────────────────────

function MonthView({
  tasks,
  current,
  today,
  onDayClick,
}: {
  tasks: Task[]
  current: Date
  today: Date
  onDayClick: (d: Date) => void
}) {
  const year = current.getFullYear()
  const month = current.getMonth()

  const grid = useMemo(() => {
    const first = new Date(year, month, 1)
    const start = startOfWeek(first)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [year, month])

  return (
    <div className="flex-1 overflow-auto px-4 py-3">
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_SHORT.map((d) => (
          <div
            key={d}
            className="py-1 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground/40"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((day, i) => {
          const isCurrentMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const dayTasks = tasksOnDay(tasks, day)
          const MAX_ITEMS = 3
          const extra = dayTasks.length - MAX_ITEMS

          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              className={cn(
                'group relative min-h-[76px] cursor-pointer rounded-lg border p-1.5 transition-colors hover:bg-surface-2',
                isCurrentMonth ? 'border-border/50 bg-surface' : 'border-transparent bg-transparent',
                isToday && 'border-primary/40 bg-primary/5 hover:bg-primary/8'
              )}
            >
              <div
                className={cn(
                  'mb-1 flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-medium',
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : isCurrentMonth
                      ? 'text-foreground'
                      : 'text-muted-foreground/25'
                )}
              >
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, MAX_ITEMS).map((t) => (
                  <TaskChip key={t.id} task={t} />
                ))}
                {extra > 0 && (
                  <div className="font-mono text-[9px] text-muted-foreground/40">+{extra} more</div>
                )}
              </div>

              {/* Hover preview tooltip */}
              {dayTasks.length > 0 && (
                <div className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-1.5 hidden w-52 -translate-x-1/2 rounded-lg border border-border bg-surface p-2.5 shadow-lg group-hover:block">
                  <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                    {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} &middot; {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-start gap-1.5">
                        <span className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', t.completed ? 'bg-muted-foreground/30' : `dot-${t.priority}`)} />
                        <span className={cn('text-[11px] leading-tight', t.completed && 'text-muted-foreground/50 line-through')}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                    {dayTasks.length > 5 && (
                      <div className="text-[10px] text-muted-foreground/40">+{dayTasks.length - 5} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────

function WeekView({
  tasks,
  current,
  today,
  onDayClick,
  onTaskClick,
}: {
  tasks: Task[]
  current: Date
  today: Date
  onDayClick: (d: Date) => void
  onTaskClick: (taskId: number) => void
}) {
  const days = useMemo(() => {
    const start = startOfWeek(current)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [current])

  return (
    <div className="flex flex-1 divide-x divide-border overflow-hidden">
      {days.map((day, i) => {
        const isToday = isSameDay(day, today)
        const dayTasks = tasksOnDay(tasks, day)

        return (
          <div key={i} className={cn('flex min-w-0 flex-1 flex-col', isToday && 'bg-primary/5')}>
            <div
              onClick={() => onDayClick(day)}
              className={cn(
                'cursor-pointer border-b border-border px-2 py-2.5 text-center transition-colors hover:bg-surface-2',
                isToday && 'border-primary/30'
              )}
            >
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
                {WEEKDAY_SHORT[day.getDay()]}
              </div>
              <div
                className={cn(
                  'mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold',
                  isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                )}
              >
                {day.getDate()}
              </div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
              {dayTasks.map((t) => (
                <div key={t.id} onClick={() => onTaskClick(t.id)} className="cursor-pointer rounded transition-all hover:ring-1 hover:ring-primary/40 hover:bg-primary/5">
                  <TaskChip task={t} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── DAY VIEW ──────────────────────────────────────────────────────────────────

function DayView({
  tasks,
  current,
  today,
  onTaskClick,
}: {
  tasks: Task[]
  current: Date
  today: Date
  onTaskClick: (taskId: number) => void
}) {
  const updateTask = useUpdateTask()
  const isToday = isSameDay(current, today)
  const dayTasks = useMemo(() => tasksOnDay(tasks, current), [tasks, current])
  const todayMidnight = new Date(today)

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {dayTasks.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2">
          <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
          <p className="text-xs text-muted-foreground/40">
            No tasks due {isToday ? 'today' : 'on this day'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayTasks.map((t) => {
            const isOverdue = !t.completed && t.due_date && parseTaskDate(t.due_date) < todayMidnight
            return (
              <div
                key={t.id}
                onClick={() => onTaskClick(t.id)}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-3.5 transition-all hover:border-primary/40 hover:bg-surface-2',
                  t.completed
                    ? 'border-border/40 opacity-60 hover:opacity-80'
                    : isOverdue
                      ? 'border-red-500/20 bg-red-500/5 hover:bg-red-500/10'
                      : 'border-border'
                )}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); updateTask.mutate({ id: t.id, data: { completed: !t.completed } }) }}
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all',
                    t.completed
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-border text-transparent hover:border-primary/60'
                  )}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M1 4l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-semibold leading-snug',
                      t.completed && 'text-muted-foreground line-through'
                    )}
                  >
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                  )}
                  {t.parent_id && (
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground/40">subtask</p>
                  )}
                </div>

                <div
                  className={cn(
                    'rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider',
                    CHIP_CLS[t.priority]
                  )}
                >
                  {t.priority[0]}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

export default function CalendarView({
  onTaskClick,
}: {
  onTaskClick?: (taskId: number) => void
}) {
  const { data: tasks = [] } = useTasks()
  const allTasks = useMemo(() => flattenTasks(tasks), [tasks])
  const tasksWithDeadline = useMemo(() => allTasks.filter((t) => t.due_date), [allTasks])
  const handleTaskClick = useCallback((taskId: number) => {
    onTaskClick?.(taskId)
  }, [onTaskClick])

  const [scale, setScale] = useState<Scale>('month')
  const [current, setCurrent] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const navigate = (dir: -1 | 1) => {
    setCurrent((prev) => {
      const d = new Date(prev)
      if (scale === 'day') d.setDate(d.getDate() + dir)
      else if (scale === 'week') d.setDate(d.getDate() + dir * 7)
      else d.setMonth(d.getMonth() + dir)
      return d
    })
  }

  const headerLabel = (() => {
    if (scale === 'day') {
      return current.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    } else if (scale === 'week') {
      const start = startOfWeek(current)
      const end = addDays(start, 6)
      if (start.getMonth() === end.getMonth()) {
        return `${MONTH_NAMES[start.getMonth()]} ${start.getDate()}\u2013${end.getDate()}, ${start.getFullYear()}`
      }
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return `${MONTH_NAMES[current.getMonth()]} ${current.getFullYear()}`
  })()

  const noDeadlineCount = allTasks.filter((t) => !t.due_date && !t.completed).length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="relative flex items-center border-b border-border px-6 py-3">
        {/* Navigation — centered */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 9L4.5 6l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <span className="min-w-[220px] text-center text-sm font-semibold">{headerLabel}</span>

            <button
              onClick={() => navigate(1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              onClick={() => setCurrent(new Date(today))}
              className="ml-1 rounded-lg border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
            >
              Today
            </button>
          </div>
        </div>

        {/* Scale toggle — right */}
        <div className="ml-auto flex rounded-lg border border-border p-0.5">
          {(['day', 'week', 'month'] as Scale[]).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                'rounded-md px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-all',
                scale === s ? 'bg-primary/20 text-primary' : 'text-muted-foreground/70 hover:text-foreground'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* View content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {scale === 'month' && (
          <MonthView tasks={tasksWithDeadline} current={current} today={today} onDayClick={(d) => { setCurrent(d); setScale('day') }} />
        )}
        {scale === 'week' && (
          <WeekView tasks={tasksWithDeadline} current={current} today={today} onDayClick={(d) => { setCurrent(d); setScale('day') }} onTaskClick={handleTaskClick} />
        )}
        {scale === 'day' && (
          <DayView tasks={tasksWithDeadline} current={current} today={today} onTaskClick={handleTaskClick} />
        )}
      </div>

      {noDeadlineCount > 0 && (
        <div className="border-t border-border px-6 py-2">
          <p className="font-mono text-[10px] text-muted-foreground/30">
            {noDeadlineCount} active {noDeadlineCount === 1 ? 'task' : 'tasks'} without a deadline · not shown on calendar
          </p>
        </div>
      )}
    </div>
  )
}
