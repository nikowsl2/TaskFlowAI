import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { chatApi } from '@/lib/api'
import { useChatStore } from '@/store/chatStore'

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[8px] text-muted-foreground">
        AI
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

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex items-end gap-2', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[8px]',
          isUser ? 'bg-primary/20 text-primary' : 'bg-surface-2 text-muted-foreground'
        )}
      >
        {isUser ? 'You' : 'AI'}
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
  'Add a high-priority task: Review Q3 report',
  'List all my current tasks',
  'Complete the most recent task',
  'Create subtask under task #1',
]

interface ChatPanelProps {
  onSwitchMode?: () => void
  onClose?: () => void
  floating?: boolean
}

export default function ChatPanel({ onSwitchMode, onClose, floating }: ChatPanelProps) {
  const qc = useQueryClient()
  const { messages, isLoading, addMessage, updateLastAssistantMessage, setMessages, setLoading } =
    useChatStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatApi.history().then((hist) => {
      setMessages(hist.map((m) => ({ id: String(m.id), role: m.role, content: m.content })))
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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value, { stream: true }).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'text') {
              accumulated += data.content
              updateLastAssistantMessage(accumulated)
            } else if (data.type === 'done') {
              qc.invalidateQueries({ queryKey: ['tasks'] })
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      updateLastAssistantMessage('Something went wrong. Check that the backend is running and an API key is set.')
      console.error(err)
    } finally {
      setLoading(false)
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
            {floating ? 'AI Chat' : isLoading ? 'Thinking…' : 'AI Assistant'}
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
            <p className="mb-1 text-xs font-semibold text-muted-foreground/50">AI Task Assistant</p>
            <p className="mb-5 text-xs text-muted-foreground/30">Tell me what to do with your tasks</p>
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
              msg.role === 'assistant' && msg.content === '' && isLoading ? (
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
            placeholder="Ask me to manage your tasks…"
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
