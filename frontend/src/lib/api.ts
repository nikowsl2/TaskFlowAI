import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Task {
  id: number
  title: string
  description: string | null
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  parent_id: number | null
  created_at: string
  updated_at: string
  subtasks: Task[]
}

export interface TaskCreate {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  due_date?: string
  parent_id?: number
}

export interface TaskUpdate {
  title?: string
  description?: string
  completed?: boolean
  priority?: 'low' | 'medium' | 'high'
  due_date?: string | null
}

export interface Message {
  id: number
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

// ── API helpers ───────────────────────────────────────────────────────────────

export const tasksApi = {
  list: () => api.get<Task[]>('/tasks').then((r) => r.data),
  create: (data: TaskCreate) => api.post<Task>('/tasks', data).then((r) => r.data),
  update: (id: number, data: TaskUpdate) =>
    api.patch<Task>(`/tasks/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/tasks/${id}`),
}

export const chatApi = {
  history: () => api.get<Message[]>('/chat/history').then((r) => r.data),
  clearHistory: () => api.delete('/chat/history'),
}
