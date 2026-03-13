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

export interface CalendarEvent {
  id: number
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  created_at: string
}

export interface CalendarEventCreate {
  title: string
  description?: string
  start_time: string
  end_time?: string
}

export interface CalendarEventUpdate {
  title?: string
  description?: string
  start_time?: string
  end_time?: string | null
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

export const eventsApi = {
  list: () => api.get<CalendarEvent[]>('/events/').then((r) => r.data),
  create: (data: CalendarEventCreate) =>
    api.post<CalendarEvent>('/events/', data).then((r) => r.data),
  update: (id: number, data: CalendarEventUpdate) =>
    api.patch<CalendarEvent>(`/events/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/events/${id}`),
}

export interface TaskCandidate {
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
}

export interface ExtractResponse {
  title: string
  summary: string
  candidates: TaskCandidate[]
}

export interface MeetingNote {
  id: number
  title: string
  summary: string
  content: string
  meeting_time: string
  created_at: string
}

export interface MeetingNoteCreate {
  title: string
  summary: string
  content: string
  meeting_time: string
}

export interface MeetingNoteUpdate {
  title?: string
  summary?: string
  meeting_time?: string
}

export const meetingApi = {
  extract: (content: string) =>
    api.post<ExtractResponse>('/meeting/extract', { content }).then((r) => r.data),
  parseFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<{ text: string }>('/meeting/parse-file', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },
}

export const notesApi = {
  list: () => api.get<MeetingNote[]>('/notes/').then((r) => r.data),
  create: (data: MeetingNoteCreate) => api.post<MeetingNote>('/notes/', data).then((r) => r.data),
  update: (id: number, data: MeetingNoteUpdate) =>
    api.patch<MeetingNote>(`/notes/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/notes/${id}`),
}

export interface EmailDraft {
  id: number
  to_field: string
  subject: string
  body: string
  created_at: string
  updated_at: string
}

export interface EmailDraftCreate {
  to_field: string
  subject: string
  body: string
}

export interface EmailDraftUpdate {
  to_field?: string
  subject?: string
  body?: string
}

export const emailDraftsApi = {
  list: () => api.get<EmailDraft[]>('/drafts/').then((r) => r.data),
  create: (data: EmailDraftCreate) => api.post<EmailDraft>('/drafts/', data).then((r) => r.data),
  update: (id: number, data: EmailDraftUpdate) =>
    api.patch<EmailDraft>(`/drafts/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/drafts/${id}`),
}

export interface Document {
  id: number
  filename: string
  file_type: string
  summary: string
  char_count: number
  chunk_count: number
  created_at: string
}

export const docsApi = {
  list: () => api.get<Document[]>('/documents/').then((r) => r.data),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Document>('/documents/upload', form).then((r) => r.data)
  },
  delete: (id: number) => api.delete(`/documents/${id}`),
}

export const chatApi = {
  history: () => api.get<Message[]>('/chat/history').then((r) => r.data),
  clearHistory: () => api.delete('/chat/history'),
}

const BASE_URL = '/api'

// ── User Profile ──────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number
  role_and_goals: string | null
  preferences: string | null
  current_focus: string | null
  extra_notes: string | null
  updated_at: string | null
}

export interface UserProfileUpdate {
  role_and_goals?: string | null
  preferences?: string | null
  current_focus?: string | null
  extra_notes?: string | null
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface Project {
  id: number
  name: string
  description: string | null
  status: 'active' | 'on-hold' | 'completed'
  created_at: string
  updated_at: string
  last_accessed: string | null
}

export interface Episode {
  id: string
  text: string
  logged_at_ms: number | null
}

export interface ProjectCreate {
  name: string
  description?: string | null
}

export interface ProjectUpdate {
  name?: string
  description?: string | null
  status?: 'active' | 'on-hold' | 'completed'
}

export const profileApi = {
  get: (): Promise<UserProfile> =>
    fetch(`${BASE_URL}/profile/`).then((r) => r.json()),
  update: (data: UserProfileUpdate): Promise<UserProfile> =>
    fetch(`${BASE_URL}/profile/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
}

export const projectsApi = {
  list: (): Promise<Project[]> =>
    fetch(`${BASE_URL}/projects/`).then((r) => r.json()),
  create: (data: ProjectCreate): Promise<Project> =>
    fetch(`${BASE_URL}/projects/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  update: (id: number, data: ProjectUpdate): Promise<Project> =>
    fetch(`${BASE_URL}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
  delete: (id: number): Promise<void> =>
    fetch(`${BASE_URL}/projects/${id}`, { method: 'DELETE' }).then(() => undefined),
  logEpisode: (id: number, memory_text: string): Promise<{ episode_id: string }> =>
    fetch(`${BASE_URL}/projects/${id}/episodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory_text }),
    }).then((r) => r.json()),
  getEpisodes: (id: number): Promise<Episode[]> =>
    fetch(`${BASE_URL}/projects/${id}/episodes`).then((r) => r.json()),
  deleteEpisode: (id: number, episodeId: string): Promise<void> =>
    fetch(`${BASE_URL}/projects/${id}/episodes/${encodeURIComponent(episodeId)}`, {
      method: 'DELETE',
    }).then(() => undefined),
}
