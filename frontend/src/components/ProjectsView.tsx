import { useState } from 'react'
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
  return days >= 14 ? `Last active ${days} days ago` : null
}

function formatEpisodeDate(ms: number | null): string {
  if (!ms) return 'Unknown date'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const statusColors: Record<string, string> = {
  active: 'bg-green-600',
  'on-hold': 'bg-yellow-600',
  completed: 'bg-gray-600',
}

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

  return (
    <div
      className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-gray-100">{project.name}</h3>
        <div className="flex items-center gap-2">
          <select
            value={project.status}
            onChange={(e) =>
              updateProject.mutate({
                id: project.id,
                data: { status: e.target.value as Project['status'] },
              })
            }
            className={`text-xs rounded px-2 py-0.5 text-white border-0 ${statusColors[project.status]} cursor-pointer`}
          >
            <option value="active">active</option>
            <option value="on-hold">on-hold</option>
            <option value="completed">completed</option>
          </select>
          {hovered && (
            <button
              onClick={() => deleteProject.mutate(project.id)}
              className="text-red-400 hover:text-red-300 text-xs"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {project.description && (
        <p className="text-sm text-gray-400">{project.description}</p>
      )}
      <p className="text-xs text-gray-500">
        Created {new Date(project.created_at).toLocaleDateString()}
      </p>
      {stalenessLabel(project.last_accessed) && (
        <span className="inline-block text-xs text-gray-400 bg-gray-700 rounded-full px-2 py-0.5">
          {stalenessLabel(project.last_accessed)}
        </span>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowLog(!showLog)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {showLog ? 'Hide' : 'Log Event'}
        </button>
        <button
          onClick={() => setShowMemories(!showMemories)}
          className="text-xs text-purple-400 hover:text-purple-300"
        >
          {showMemories ? 'Hide Memories' : `Memories (${episodes.length})`}
        </button>
      </div>
      {showLog && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm p-2 resize-none focus:outline-none focus:border-blue-500"
            rows={2}
            placeholder="What happened or was decided..."
            value={episodeText}
            onChange={(e) => setEpisodeText(e.target.value)}
          />
          <button
            onClick={handleLog}
            disabled={logEpisode.isPending || !episodeText.trim()}
            className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
          >
            Log
          </button>
        </div>
      )}
      {showMemories && (
        <div className="border-t border-gray-700 pt-2 space-y-2">
          {episodesLoading ? (
            <p className="text-xs text-gray-500">Loading memories...</p>
          ) : episodes.length === 0 ? (
            <p className="text-xs text-gray-500">No memories stored yet.</p>
          ) : (
            episodes.map((ep) => (
              <div key={ep.id} className="flex items-start justify-between gap-2 bg-gray-700 rounded p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 break-words">{ep.text}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{formatEpisodeDate(ep.logged_at_ms)}</p>
                </div>
                <button
                  onClick={() => deleteEpisode.mutate(ep.id)}
                  disabled={deleteEpisode.isPending}
                  className="text-xs text-red-400 hover:text-red-300 shrink-0 disabled:opacity-50"
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

export function ProjectsView() {
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

  if (isLoading) return <div className="p-4 text-gray-400">Loading...</div>

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">Projects</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
        >
          New Project
        </button>
      </div>
      {showCreate && (
        <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-2">
          <input
            className="w-full rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm p-2 focus:outline-none focus:border-blue-500"
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="w-full rounded bg-gray-700 border border-gray-600 text-gray-100 text-sm p-2 focus:outline-none focus:border-blue-500"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={createProject.isPending || !newName.trim()}
              className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {projects.length === 0 && !showCreate && (
        <p className="text-sm text-gray-400">
          No projects yet. Create one or ask the AI to create one for you.
        </p>
      )}
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  )
}
