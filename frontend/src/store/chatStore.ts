import { create } from 'zustand'

export interface AttachmentLabel {
  type: string
  label: string
}

export interface ToolResultEntry {
  name: string
  ok: boolean
  message: string
}

export interface FaithfulnessResult {
  score: number
  verdict: 'faithful' | 'partial' | 'unfaithful'
  flags: string[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'email_draft' | 'morning_brief'
  content: string
  attachments?: AttachmentLabel[]
  toolResults?: ToolResultEntry[]
  faithfulness?: FaithfulnessResult
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  addMessage: (msg: ChatMessage) => void
  updateLastAssistantMessage: (content: string) => void
  updateLastBriefMessage: (content: string) => void
  appendToolResult: (entry: ToolResultEntry) => void
  setLastAssistantFaithfulness: (result: FaithfulnessResult) => void
  setMessages: (msgs: ChatMessage[]) => void
  setLoading: (v: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content }
          break
        }
      }
      return { messages: msgs }
    }),
  appendToolResult: (entry) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          const existing = msgs[i].toolResults ?? []
          msgs[i] = { ...msgs[i], toolResults: [...existing, entry] }
          break
        }
      }
      return { messages: msgs }
    }),
  setLastAssistantFaithfulness: (result) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], faithfulness: result }
          break
        }
      }
      return { messages: msgs }
    }),
  updateLastBriefMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'morning_brief') {
          msgs[i] = { ...msgs[i], content }
          break
        }
      }
      return { messages: msgs }
    }),
  setMessages: (msgs) => set({ messages: msgs }),
  setLoading: (v) => set({ isLoading: v }),
}))
