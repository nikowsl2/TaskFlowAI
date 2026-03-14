import { create } from 'zustand'

export type ContextItem =
  | {
      type: 'task'
      id: number
      title: string
      priority: string
      completed: boolean
      due_date: string | null
      description: string | null
    }
  | { type: 'note'; id: number; title: string; summary: string }
  | { type: 'email_draft'; id: number; subject: string; to_field: string; body: string }
  | { type: 'document'; id: number; title: string }
  | { type: 'project'; id: number; name: string; status: string; description: string | null }

export interface FileAttachment {
  id: string
  name: string
  content: string
}

interface AttachmentState {
  contextItems: ContextItem[]
  files: FileAttachment[]
  addContextItem: (item: ContextItem) => void
  removeContextItem: (type: string, id: number) => void
  toggleContextItem: (item: ContextItem) => void
  isAttached: (type: string, id: number) => boolean
  addFile: (file: FileAttachment) => void
  removeFile: (id: string) => void
  clearAll: () => void
}

export const useAttachmentStore = create<AttachmentState>((set, get) => ({
  contextItems: [],
  files: [],

  addContextItem: (item) =>
    set((s) => {
      if (s.contextItems.some((c) => c.type === item.type && c.id === item.id)) return s
      return { contextItems: [...s.contextItems, item] }
    }),

  removeContextItem: (type, id) =>
    set((s) => ({
      contextItems: s.contextItems.filter((c) => !(c.type === type && c.id === id)),
    })),

  toggleContextItem: (item) => {
    const { contextItems } = get()
    if (contextItems.some((c) => c.type === item.type && c.id === item.id)) {
      get().removeContextItem(item.type, item.id)
    } else {
      get().addContextItem(item)
    }
  },

  isAttached: (type, id) => get().contextItems.some((c) => c.type === type && c.id === id),

  addFile: (file) => set((s) => ({ files: [...s.files, file] })),

  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),

  clearAll: () => set({ contextItems: [], files: [] }),
}))
