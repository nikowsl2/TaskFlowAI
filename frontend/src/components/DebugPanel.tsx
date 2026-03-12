import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string
  ts: string
  level: 'INFO' | 'ERROR' | 'DEBUG'
  event: string
  data: Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  chat_request:  'bg-blue-500/15 text-blue-400 border-blue-500/25',
  agent_start:   'bg-violet-500/15 text-violet-400 border-violet-500/25',
  tool_call:     'bg-amber-500/15 text-amber-400 border-amber-500/25',
  tool_result:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  agent_done:    'bg-primary/15 text-primary border-primary/25',
  agent_error:   'bg-red-500/15 text-red-400 border-red-500/25',
}

function relativeTime(isoTs: string): string {
  const diff = Math.floor((Date.now() - new Date(isoTs).getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function shortTime(isoTs: string): string {
  return new Date(isoTs).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

// ── Single log row ────────────────────────────────────────────────────────────

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isError = entry.level === 'ERROR'
  const colorCls = EVENT_COLORS[entry.event] ?? 'bg-surface-2 text-muted-foreground border-border'

  return (
    <div
      className={cn(
        'border-b border-border/40 transition-colors',
        isError && 'bg-red-500/5',
      )}
    >
      {/* Summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2"
      >
        {/* Time */}
        <span className="w-16 shrink-0 font-mono text-[9px] text-muted-foreground/40">
          {shortTime(entry.ts)}
        </span>

        {/* Event badge */}
        <span className={cn('shrink-0 rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wider', colorCls)}>
          {entry.event.replace(/_/g, ' ')}
        </span>

        {/* Quick summary */}
        <span className="flex-1 truncate font-mono text-[10px] text-muted-foreground/60">
          {summarise(entry)}
        </span>

        {/* Expand chevron */}
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none"
          className={cn('shrink-0 text-muted-foreground/30 transition-transform', expanded && 'rotate-180')}
        >
          <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded JSON */}
      {expanded && (
        <pre className="overflow-x-auto border-t border-border/30 bg-surface/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-foreground/70">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function summarise(entry: LogEntry): string {
  const d = entry.data
  switch (entry.event) {
    case 'chat_request':
      return `"${String(d.message ?? '').slice(0, 60)}${String(d.message ?? '').length > 60 ? '…' : ''}"`
    case 'agent_start':
      return `${d.provider} / ${d.model}`
    case 'tool_call':
      return `${d.name}(${Object.keys(d.args as object ?? {}).join(', ')})`
    case 'tool_result': {
      const ok = d.ok ? '✓' : '✗'
      return `${ok} ${d.name} — ${String(d.message ?? '').slice(0, 60)}`
    }
    case 'agent_done':
      return `${d.tool_calls} tool call(s) · ${d.response_len} chars`
    case 'agent_error':
      return String(d.error ?? '')
    default:
      return JSON.stringify(d).slice(0, 80)
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const ALL_EVENTS = ['chat_request', 'agent_start', 'tool_call', 'tool_result', 'agent_done', 'agent_error']

// ── Main panel ────────────────────────────────────────────────────────────────

export default function DebugPanel() {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ['debug-logs'],
    queryFn: () => api.get<LogEntry[]>('/logs/').then((r) => r.data),
    refetchInterval: open ? 2000 : false,
    enabled: open,
  })

  const clearLogs = async () => {
    await api.delete('/logs/')
    qc.invalidateQueries({ queryKey: ['debug-logs'] })
  }

  const visible = filter ? logs.filter((l) => l.event === filter) : logs

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Debug logs"
        className={cn(
          'fixed bottom-5 left-5 z-50 flex h-9 w-9 items-center justify-center rounded-full border shadow-lg transition-all',
          open
            ? 'border-primary/50 bg-primary/15 text-primary'
            : 'border-border bg-surface text-muted-foreground/50 hover:border-primary/30 hover:text-muted-foreground'
        )}
      >
        {/* Bug / debug icon */}
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.5 4.5V2M7.5 10.5V13M4.5 7.5H2M10.5 7.5H13M4.9 4.9L3.2 3.2M10.1 10.1l1.7 1.7M4.9 10.1L3.2 11.8M10.1 4.9l1.7-1.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-16 left-5 z-50 flex w-[580px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
          style={{ maxHeight: 'calc(100vh - 8rem)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Debug Logs
              </span>
              <span className="rounded bg-surface-2 px-1.5 py-px font-mono text-[9px] text-muted-foreground/50">
                {logs.length}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={clearLogs}
                className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-red-400"
              >
                Clear
              </button>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['debug-logs'] })}
                className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              >
                Refresh
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border px-3 py-1.5">
            <button
              onClick={() => setFilter(null)}
              className={cn(
                'rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all',
                filter === null ? 'bg-primary/15 text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'
              )}
            >
              All
            </button>
            {ALL_EVENTS.map((ev) => (
              <button
                key={ev}
                onClick={() => setFilter(filter === ev ? null : ev)}
                className={cn(
                  'rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all',
                  filter === ev
                    ? (EVENT_COLORS[ev] ?? 'bg-primary/15 text-primary')
                    : 'border-transparent text-muted-foreground/40 hover:text-muted-foreground'
                )}
              >
                {ev.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          {/* Log entries */}
          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="flex h-24 items-center justify-center">
                <p className="font-mono text-[10px] text-muted-foreground/30">
                  {logs.length === 0 ? 'No logs yet — send a chat message' : 'No entries match filter'}
                </p>
              </div>
            ) : (
              visible.map((entry) => <LogRow key={entry.id} entry={entry} />)
            )}
          </div>

          {/* Footer: live indicator */}
          <div className="flex items-center gap-1.5 border-t border-border px-3 py-1.5">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            <span className="font-mono text-[9px] text-muted-foreground/30">
              live · refreshes every 2s
            </span>
            {logs[0] && (
              <span className="ml-auto font-mono text-[9px] text-muted-foreground/25">
                last: {relativeTime(logs[0].ts)}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
