import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { chatApi } from '@/lib/api'
import { useChatStore } from '@/store/chatStore'
import { EmailDraftCard, type EmailDraftData } from './EmailDraftCard'

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[8px] text-muted-foreground">
        TF
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-surface px-4 py-2.5">
        {[0, 0.2, 0.4].map((d) => (
          <div
            key={d}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground/50"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      </div>
    </div>
  )
}

const BRIEF_LS_KEY = 'taskflow-brief-date'
const getTodayISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const shouldTriggerBrief = () => {
  try { return localStorage.getItem(BRIEF_LS_KEY) !== getTodayISO() }
  catch { return false }
}
const markBriefDone = () => {
  try { localStorage.setItem(BRIEF_LS_KEY, getTodayISO()) }
  catch { /* ignore */ }
}

function MessageBubble({ role, content }: { role: string; content: string }) {
  if (role === 'morning_brief') {
    return (
      <div className="flex items-end gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[8px] text-muted-foreground">
          TF
        </div>
        <div className="max-w-[85%] flex-1">
          <div className="rounded-2xl rounded-bl-sm bg-surface px-3.5 py-2 text-sm leading-relaxed ring-1 ring-primary/20">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-primary/50">
                Morning Brief
              </span>
              <div className="h-px flex-1 bg-primary/10" />
            </div>
            <pre className="whitespace-pre-wrap font-sans text-[13px]">{content}</pre>
          </div>
        </div>
      </div>
    )
  }

  if (role === 'email_draft') {
    try {
      const draft: EmailDraftData = JSON.parse(content)
      return (
        <div className="flex items-end gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 font-mono text-[8px] text-blue-400">
            ✉
          </div>
          <div className="max-w-[85%] flex-1">
            <EmailDraftCard draft={draft} />
          </div>
        </div>
      )
    } catch {
      return null
    }
  }

  const isUser = role === 'user'
  return (
    <div className={cn('flex items-end gap-2', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[8px]',
          isUser ? 'bg-primary/20 text-primary' : 'bg-surface-2 text-muted-foreground'
        )}
      >
        {isUser ? 'You' : 'TF'}
      </div>
      <div
        className={cn(
          'max-w-[78%] px-3.5 py-2 text-sm leading-relaxed',
          isUser
            ? 'rounded-2xl rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-2xl rounded-bl-sm bg-surface text-foreground'
        )}
      >
        <pre className="whitespace-pre-wrap font-sans text-[13px]">{content}</pre>
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  'Process these notes: "Finish slides by Friday. Team sync next Monday at 10am."',
  'Draft an email to Bob saying I\'m free for a sync tomorrow at 2pm',
  'Add a high-priority task: Review Q3 report',
  'Schedule a team meeting for tomorrow at 2pm',
]

interface ChatPanelProps {
  onSwitchMode?: () => void
  onClose?: () => void
  floating?: boolean
}

export default function ChatPanel({ onSwitchMode, onClose, floating }: ChatPanelProps) {
  const qc = useQueryClient()
  const { messages, isLoading, addMessage, updateLastAssistantMessage,
          updateLastBriefMessage, setMessages, setLoading } = useChatStore()
  const [input, setInput] = useState('')
  const [statusText, setStatusText] = useState<string | null>(null)
  const [isBriefLoading, setIsBriefLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const triggerMorningBrief = async () => {
    const briefId = `brief-${Date.now()}`
    addMessage({ id: briefId, role: 'morning_brief', content: '' })
    setIsBriefLoading(true)
    try {
      const res = await chatApi.morningBrief()
      if (res.status === 204) {
        useChatStore.setState((s) => ({ messages: s.messages.filter((m) => m.id !== briefId) }))
        return
      }
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let sseBuffer = ''
      let succeeded = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        const events = sseBuffer.split('\n\n')
        sseBuffer = events.pop() ?? ''
        for (const event of events) {
          const line = event.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'morning_brief_text') {
              accumulated += data.content
              updateLastBriefMessage(accumulated)
            } else if (data.type === 'status') {
              setStatusText(data.content)
            } else if (data.type === 'morning_brief_done') {
              succeeded = true
              markBriefDone()
              qc.invalidateQueries({ queryKey: ['tasks'] })
            }
          } catch { /* ignore */ }
        }
      }
      if (!succeeded) {
        useChatStore.setState((s) => ({ messages: s.messages.filter((m) => m.id !== briefId) }))
      }
    } catch {
      useChatStore.setState((s) => ({ messages: s.messages.filter((m) => m.id !== briefId) }))
    } finally {
      setIsBriefLoading(false)
      setStatusText(null)
    }
  }

  useEffect(() => {
    chatApi.history().then((hist) => {
      setMessages(hist.map((m) => ({ id: String(m.id), role: m.role, content: m.content })))
      if (shouldTriggerBrief()) {
        triggerMorningBrief()
      }
    })
  }, [setMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isLoading) return
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    addMessage({ id: Date.now().toString(), role: 'user', content: msg })
    addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: '' })
    setLoading(true)

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      })
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        // SSE events are delimited by double-newline; split on that boundary
        const events = sseBuffer.split('\n\n')
        // Keep the last (potentially incomplete) segment in the buffer
        sseBuffer = events.pop() ?? ''
        for (const event of events) {
          const line = event.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') {
              setStatusText(null)
              accumulated += data.content
              updateLastAssistantMessage(accumulated)
            } else if (data.type === 'status') {
              setStatusText(data.content)
            } else if (data.type === 'email_draft') {
              addMessage({
                id: `draft-${data.data.id}-${Date.now()}`,
                role: 'email_draft',
                content: JSON.stringify(data.data),
              })
            } else if (data.type === 'done') {
              qc.invalidateQueries({ queryKey: ['tasks'] })
              qc.invalidateQueries({ queryKey: ['events'] })
              qc.invalidateQueries({ queryKey: ['drafts'] })
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      updateLastAssistantMessage('Something went wrong. Check that the backend is running and an API key is set.')
      console.error(err)
    } finally {
      setLoading(false)
      setStatusText(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              isLoading ? 'animate-pulse bg-primary' : 'bg-primary/40'
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {floating
              ? 'TaskFlow'
              : isLoading
                ? (statusText ?? 'Thinking\u2026')
                : 'TaskFlow'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {onSwitchMode && (
            <button
              onClick={onSwitchMode}
              className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              ← Tasks
            </button>
          )}
          <button
            onClick={() => chatApi.clearHistory().then(() => setMessages([]))}
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          >
            Clear
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-1.5 font-mono text-2xl text-muted-foreground/10">◆</div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground/50">TaskFlow Assistant</p>
            <p className="mb-5 text-xs text-muted-foreground/30">Manage tasks or paste meeting notes</p>
            <div className={cn('grid w-full gap-1.5', floating ? 'max-w-xs' : 'max-w-sm')}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-surface-2 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) =>
              (msg.role === 'assistant' && msg.content === '' && isLoading) || (msg.role === 'morning_brief' && msg.content === '' && isBriefLoading) ? (
                <TypingIndicator key={msg.id} />
              ) : (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
              )
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-primary/40">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to manage tasks or process meeting notes\u2026"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/30 disabled:opacity-50"
            style={{ maxHeight: '100px' }}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = `${Math.min(t.scrollHeight, 100)}px`
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
              !isLoading && input.trim()
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-muted text-muted-foreground/30'
            )}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 6.5h11M6.5 1l5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {!floating && (
          <p className="mt-1 text-center font-mono text-[9px] text-muted-foreground/20">
            Enter to send · Shift+Enter for newline
          </p>
        )}
      </div>
    </div>
  )
}
