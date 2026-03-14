import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { notesApi, emailDraftsApi } from '@/lib/api'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { useDocuments } from '@/hooks/useDocuments'
import { useAttachmentStore, type ContextItem } from '@/store/attachmentStore'

const TABS = ['Tasks', 'Notes', 'Email', 'Docs', 'Projects'] as const
type Tab = (typeof TABS)[number]

export default function ContextPicker() {
  const [tab, setTab] = useState<Tab>('Tasks')
  const { toggleContextItem, isAttached } = useAttachmentStore()

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-border bg-background shadow-lg">
      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-t-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
              tab === t
                ? 'bg-surface-2 text-foreground'
                : 'text-muted-foreground/50 hover:text-muted-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[280px] overflow-y-auto p-2">
        {tab === 'Tasks' && <TasksList toggle={toggleContextItem} isAttached={isAttached} />}
        {tab === 'Notes' && <NotesList toggle={toggleContextItem} isAttached={isAttached} />}
        {tab === 'Email' && <EmailList toggle={toggleContextItem} isAttached={isAttached} />}
        {tab === 'Docs' && <DocsList toggle={toggleContextItem} isAttached={isAttached} />}
        {tab === 'Projects' && (
          <ProjectsList toggle={toggleContextItem} isAttached={isAttached} />
        )}
      </div>
    </div>
  )
}

interface ListProps {
  toggle: (item: ContextItem) => void
  isAttached: (type: string, id: number) => boolean
}

function ItemRow({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
        checked ? 'bg-primary/10 text-foreground' : 'hover:bg-surface-2 text-muted-foreground'
      )}
    >
      <div
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
        )}
      >
        {checked && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {children}
    </button>
  )
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-emerald-400',
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-4 text-center text-[11px] text-muted-foreground/40">No {label} found</p>
}

function TasksList({ toggle, isAttached }: ListProps) {
  const { data: tasks, isLoading } = useTasks()
  const topLevel = tasks?.filter((t) => !t.parent_id) ?? []
  if (isLoading) return <p className="py-4 text-center text-[11px] text-muted-foreground/40">Loading...</p>
  if (!topLevel.length) return <EmptyState label="tasks" />
  return (
    <div className="space-y-0.5">
      {topLevel.map((t) => (
        <ItemRow
          key={t.id}
          checked={isAttached('task', t.id)}
          onClick={() =>
            toggle({
              type: 'task',
              id: t.id,
              title: t.title,
              priority: t.priority,
              completed: t.completed,
              due_date: t.due_date,
              description: t.description,
            })
          }
        >
          <span className="flex-1 truncate">{t.title}</span>
          <div className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_COLORS[t.priority])} />
          {t.completed && <span className="text-[9px] text-muted-foreground/40">done</span>}
        </ItemRow>
      ))}
    </div>
  )
}

function NotesList({ toggle, isAttached }: ListProps) {
  const { data: notes, isLoading } = useQuery({
    queryKey: ['meeting-notes'],
    queryFn: notesApi.list,
  })
  if (isLoading) return <p className="py-4 text-center text-[11px] text-muted-foreground/40">Loading...</p>
  if (!notes?.length) return <EmptyState label="notes" />
  return (
    <div className="space-y-0.5">
      {notes.map((n) => (
        <ItemRow
          key={n.id}
          checked={isAttached('note', n.id)}
          onClick={() => toggle({ type: 'note', id: n.id, title: n.title, summary: n.summary })}
        >
          <span className="flex-1 truncate">{n.title}</span>
          <span className="text-[9px] text-muted-foreground/30">
            {new Date(n.meeting_time).toLocaleDateString()}
          </span>
        </ItemRow>
      ))}
    </div>
  )
}

function EmailList({ toggle, isAttached }: ListProps) {
  const { data: drafts, isLoading } = useQuery({
    queryKey: ['drafts'],
    queryFn: emailDraftsApi.list,
  })
  if (isLoading) return <p className="py-4 text-center text-[11px] text-muted-foreground/40">Loading...</p>
  if (!drafts?.length) return <EmptyState label="email drafts" />
  return (
    <div className="space-y-0.5">
      {drafts.map((d) => (
        <ItemRow
          key={d.id}
          checked={isAttached('email_draft', d.id)}
          onClick={() =>
            toggle({
              type: 'email_draft',
              id: d.id,
              subject: d.subject,
              to_field: d.to_field,
              body: d.body,
            })
          }
        >
          <span className="flex-1 truncate">{d.subject}</span>
          <span className="text-[9px] text-muted-foreground/30 truncate max-w-[80px]">
            {d.to_field}
          </span>
        </ItemRow>
      ))}
    </div>
  )
}

function DocsList({ toggle, isAttached }: ListProps) {
  const { data: docs, isLoading } = useDocuments()
  if (isLoading) return <p className="py-4 text-center text-[11px] text-muted-foreground/40">Loading...</p>
  if (!docs?.length) return <EmptyState label="documents" />
  return (
    <div className="space-y-0.5">
      {docs.map((d) => (
        <ItemRow
          key={d.id}
          checked={isAttached('document', d.id)}
          onClick={() => toggle({ type: 'document', id: d.id, title: d.filename })}
        >
          <span className="flex-1 truncate">{d.filename}</span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted-foreground/40">
            {d.file_type}
          </span>
        </ItemRow>
      ))}
    </div>
  )
}

function ProjectsList({ toggle, isAttached }: ListProps) {
  const { data: projects, isLoading } = useProjects()
  if (isLoading) return <p className="py-4 text-center text-[11px] text-muted-foreground/40">Loading...</p>
  if (!projects?.length) return <EmptyState label="projects" />

  const STATUS_COLORS: Record<string, string> = {
    active: 'text-emerald-400',
    'on-hold': 'text-amber-400',
    completed: 'text-muted-foreground/40',
  }

  return (
    <div className="space-y-0.5">
      {projects.map((p) => (
        <ItemRow
          key={p.id}
          checked={isAttached('project', p.id)}
          onClick={() =>
            toggle({
              type: 'project',
              id: p.id,
              name: p.name,
              status: p.status,
              description: p.description,
            })
          }
        >
          <span className="flex-1 truncate">{p.name}</span>
          <span className={cn('text-[9px]', STATUS_COLORS[p.status] ?? 'text-muted-foreground/40')}>
            {p.status}
          </span>
        </ItemRow>
      ))}
    </div>
  )
}
