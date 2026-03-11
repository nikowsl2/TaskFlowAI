import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/api'
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from '@/hooks/useTasks'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

function TaskItem({ task, depth = 0 }: { task: Task; depth?: number }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  return (
    <div className={cn('group', depth > 0 && 'ml-5 border-l border-border pl-3')}>
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-muted/50">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => updateTask.mutate({ id: task.id, data: { completed: !task.completed } })}
          className="mt-1 h-4 w-4 cursor-pointer accent-primary"
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', task.completed && 'text-muted-foreground line-through')}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{task.description}</p>
          )}
        </div>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-medium', PRIORITY_COLORS[task.priority])}>
          {task.priority}
        </span>
        <button
          onClick={() => deleteTask.mutate(task.id)}
          className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          aria-label="Delete task"
        >
          ×
        </button>
      </div>
      {task.subtasks?.map((sub) => (
        <TaskItem key={sub.id} task={sub} depth={depth + 1} />
      ))}
    </div>
  )
}

function AddTaskForm({ onClose }: { onClose: () => void }) {
  const createTask = useCreateTask()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createTask.mutate({ title: title.trim(), priority }, { onSuccess: () => { setTitle(''); onClose() } })
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title..."
        className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
      />
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
        Add
      </button>
      <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
        Cancel
      </button>
    </form>
  )
}

export default function TaskPanel() {
  const { data: tasks = [], isLoading } = useTasks()
  const [adding, setAdding] = useState(false)

  const done = tasks.filter((t) => t.completed).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="font-semibold">Tasks</h2>
          <p className="text-xs text-muted-foreground">{done}/{tasks.length} completed</p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
        >
          + Add
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {adding && <AddTaskForm onClose={() => setAdding(false)} />}

        {isLoading ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No tasks yet. Add one above or ask the AI!
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
