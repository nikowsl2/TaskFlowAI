import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useLogEpisode,
  useProjectEpisodes,
  useDeleteEpisode,
} from '../hooks/useProjects'
import { Project } from '../lib/api'

function stalenessLabel(lastAccessed: string | null): string | null {
  if (!lastAccessed) return null
  const days = Math.floor((Date.now() - new Date(lastAccessed).getTime()) / 86_400_000)
  return days >= 14 ? `Last active ${days}d ago` : null
}

function formatEpisodeDate(ms: number | null): string {
  if (!ms) return 'Unknown date'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-500',
  'on-hold': 'bg-yellow-500/15 text-yellow-500',
  completed: 'bg-muted text-muted-foreground',
}

// ── Compact project card (sidebar) ────────────────────────────────────────

function CompactProjectCard({ project }: { project: Project }) {
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const logEpisode = useLogEpisode()
  const [expanded, setExpanded] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [episodeText, setEpisodeText] = useState('')
  const { data: episodes = [], isLoading: episodesLoading } = useProjectEpisodes(project.id)
  const deleteEpisode = useDeleteEpisode(project.id)
  const [showMemories, setShowMemories] = useState(false)

  const handleLog = () => {
    if (!episodeText.trim()) return
    logEpisode.mutate(
      { id: project.id, memory_text: episodeText },
      { onSuccess: () => setEpisodeText('') }
    )
  }

  const stale = stalenessLabel(project.last_accessed)

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
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-semibold">{project.name}</p>
            <span className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
              STATUS_STYLES[project.status]
            )}>
              {project.status}
            </span>
          </div>
          {project.description && (
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
              {project.description}
            </p>
          )}
          {stale && (
            <p className="mt-0.5 text-[9px] text-muted-foreground/40">{stale}</p>
          )}
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
        <div className="border-t border-border/40 bg-surface-2 px-3 pb-3 pt-2.5 space-y-2">
          {/* Status + date */}
          <div className="flex items-center justify-between">
            <select
              value={project.status}
              onChange={(e) =>
                updateProject.mutate({
                  id: project.id,
                  data: { status: e.target.value as Project['status'] },
                })
              }
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-semibold border-0 cursor-pointer',
                STATUS_STYLES[project.status],
                'bg-transparent'
              )}
            >
              <option value="active">active</option>
              <option value="on-hold">on-hold</option>
              <option value="completed">completed</option>
            </select>
            <span className="text-[10px] text-muted-foreground/40">
              {new Date(project.created_at).toLocaleDateString()}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLog(!showLog)}
              className="text-[10px] font-semibold text-primary/70 hover:text-primary"
            >
              {showLog ? 'Hide' : 'Log'}
            </button>
            <button
              onClick={() => setShowMemories(!showMemories)}
              className="text-[10px] font-semibold text-purple-400/70 hover:text-purple-400"
            >
              {showMemories ? 'Hide' : `Memories (${episodes.length})`}
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete "${project.name}"?`)) {
                  deleteProject.mutate(project.id)
                }
              }}
              className="ml-auto text-[10px] font-semibold text-muted-foreground/30 hover:text-red-400"
            >
              Delete
            </button>
          </div>

          {/* Log input */}
          {showLog && (
            <div className="space-y-1.5">
              <textarea
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-[11px] resize-none outline-none focus:border-primary/40"
                rows={2}
                placeholder="What happened…"
                value={episodeText}
                onChange={(e) => setEpisodeText(e.target.value)}
              />
              <button
                onClick={handleLog}
                disabled={logEpisode.isPending || !episodeText.trim()}
                className="rounded bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
              >
                Log
              </button>
            </div>
          )}

          {/* Memories */}
          {showMemories && (
            <div className="space-y-1.5 border-t border-border/40 pt-2">
              {episodesLoading ? (
                <p className="text-[10px] text-muted-foreground/40">Loading…</p>
              ) : episodes.length === 0 ? (
                <p className="text-[10px] text-muted-foreground/40">No memories yet</p>
              ) : (
                episodes.map((ep) => (
                  <div key={ep.id} className="flex items-start gap-1.5 rounded border border-border/40 bg-surface px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] leading-relaxed break-words">{ep.text}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground/40">
                        {formatEpisodeDate(ep.logged_at_ms)}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteEpisode.mutate(ep.id)}
                      disabled={deleteEpisode.isPending}
                      className="shrink-0 text-[9px] text-muted-foreground/30 hover:text-red-400 disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Full project card (manual mode) ──────────────────────────────────────

function ProjectCard({ project }: { project: Project }) {
  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const logEpisode = useLogEpisode()
  const [showLog, setShowLog] = useState(false)
  const [showMemories, setShowMemories] = useState(false)
  const [episodeText, setEpisodeText] = useState('')
  const [hovered, setHovered] = useState(false)
  const { data: episodes = [], isLoading: episodesLoading } = useProjectEpisodes(project.id)
  const deleteEpisode = useDeleteEpisode(project.id)

  const handleLog = () => {
    if (!episodeText.trim()) return
    logEpisode.mutate(
      { id: project.id, memory_text: episodeText },
      { onSuccess: () => setEpisodeText('') }
    )
  }

  const stale = stalenessLabel(project.last_accessed)

  return (
    <div
      className="rounded-lg border border-border bg-surface p-4 space-y-2 transition-all hover:border-border/60"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{project.name}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={project.status}
            onChange={(e) =>
              updateProject.mutate({
                id: project.id,
                data: { status: e.target.value as Project['status'] },
              })
            }
            className={cn(
              'rounded px-2 py-0.5 text-xs font-semibold border-0 cursor-pointer',
              STATUS_STYLES[project.status]
            )}
          >
            <option value="active">active</option>
            <option value="on-hold">on-hold</option>
            <option value="completed">completed</option>
          </select>
          {hovered && (
            <button
              onClick={() => {
                if (window.confirm(`Delete project "${project.name}" and all its memories? This cannot be undone.`)) {
                  deleteProject.mutate(project.id)
                }
              }}
              className="text-xs text-muted-foreground/40 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {project.description && (
        <p className="text-sm text-muted-foreground">{project.description}</p>
      )}
      <p className="text-xs text-muted-foreground/50">
        Created {new Date(project.created_at).toLocaleDateString()}
      </p>
      {stale && (
        <span className="inline-block text-xs text-muted-foreground/60 bg-surface-2 rounded-full px-2 py-0.5">
          {stale}
        </span>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowLog(!showLog)}
          className="text-xs text-primary/70 hover:text-primary transition-colors"
        >
          {showLog ? 'Hide' : 'Log Event'}
        </button>
        <button
          onClick={() => setShowMemories(!showMemories)}
          className="text-xs text-purple-400/70 hover:text-purple-400 transition-colors"
        >
          {showMemories ? 'Hide Memories' : `Memories (${episodes.length})`}
        </button>
      </div>
      {showLog && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-lg border border-border bg-surface-2 text-sm p-2.5 resize-none outline-none focus:border-primary/40"
            rows={2}
            placeholder="What happened or was decided..."
            value={episodeText}
            onChange={(e) => setEpisodeText(e.target.value)}
          />
          <button
            onClick={handleLog}
            disabled={logEpisode.isPending || !episodeText.trim()}
            className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/25 disabled:opacity-40"
          >
            Log
          </button>
        </div>
      )}
      {showMemories && (
        <div className="border-t border-border pt-2 space-y-2">
          {episodesLoading ? (
            <p className="text-xs text-muted-foreground/50">Loading memories...</p>
          ) : episodes.length === 0 ? (
            <p className="text-xs text-muted-foreground/50">No memories stored yet.</p>
          ) : (
            episodes.map((ep) => (
              <div key={ep.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs break-words">{ep.text}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatEpisodeDate(ep.logged_at_ms)}</p>
                </div>
                <button
                  onClick={() => deleteEpisode.mutate(ep.id)}
                  disabled={deleteEpisode.isPending}
                  className="text-xs text-muted-foreground/40 hover:text-red-400 shrink-0 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── ProjectsView ─────────────────────────────────────────────────────────

export function ProjectsView({ compact }: { compact?: boolean }) {
  const { data: projects = [], isLoading } = useProjects()
  const createProject = useCreateProject()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) return
    createProject.mutate(
      { name: newName.trim(), description: newDesc.trim() || null },
      {
        onSuccess: () => {
          setNewName('')
          setNewDesc('')
          setShowCreate(false)
        },
      }
    )
  }

  if (compact) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Projects
          </span>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-[10px] font-semibold text-primary transition-colors hover:text-primary/80"
          >
            {showCreate ? '✕ cancel' : '+ new'}
          </button>
        </div>

        {showCreate && (
          <div className="border-b border-border px-3 py-2.5 space-y-1.5">
            <input
              autoFocus
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary/40 placeholder:text-muted-foreground/30"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setShowCreate(false)}
            />
            <input
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary/40 placeholder:text-muted-foreground/30"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <button
              onClick={handleCreate}
              disabled={createProject.isPending || !newName.trim()}
              className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground disabled:opacity-40"
            >
              Create
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border border-primary border-t-transparent" />
            </div>
          ) : projects.length === 0 && !showCreate ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
              <p className="text-[10px] text-muted-foreground/30">No projects yet</p>
            </div>
          ) : (
            projects.map((p) => (
              <CompactProjectCard key={p.id} project={p} />
            ))
          )}
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Projects</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-bold transition-all',
            showCreate
              ? 'bg-surface-2 text-muted-foreground'
              : 'bg-primary text-primary-foreground hover:opacity-90'
          )}
        >
          {showCreate ? 'Cancel' : 'New Project'}
        </button>
      </div>
      {showCreate && (
        <div className="rounded-lg border border-primary/30 bg-surface p-4 space-y-3">
          <input
            autoFocus
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-semibold outline-none focus:border-primary/40 placeholder:text-muted-foreground/30"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary/40 placeholder:text-muted-foreground/30"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <button
            onClick={handleCreate}
            disabled={createProject.isPending || !newName.trim()}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      )}
      {projects.length === 0 && !showCreate && (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <div className="font-mono text-2xl text-muted-foreground/15">◇</div>
          <p className="text-xs text-muted-foreground/40">
            No projects yet. Create one or ask the AI to create one for you.
          </p>
        </div>
      )}
      <div className="space-y-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  )
}
