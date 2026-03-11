import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { chatApi } from '@/lib/api'
import { useChatStore } from '@/store/chatStore'

function MessageBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground'
        )}
      >
        <pre className="whitespace-pre-wrap font-sans">{content}</pre>
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const qc = useQueryClient()
  const { messages, isLoading, addMessage, updateLastAssistantMessage, setMessages, setLoading } =
    useChatStore()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load history on mount
  useEffect(() => {
    chatApi.history().then((hist) => {
      setMessages(
        hist.map((m) => ({ id: String(m.id), role: m.role, content: m.content }))
      )
    })
  }, [setMessages])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')

    // Add user message
    addMessage({ id: Date.now().toString(), role: 'user', content: text })

    // Placeholder for streaming assistant message
    const assistantId = (Date.now() + 1).toString()
    addMessage({ id: assistantId, role: 'assistant', content: '' })
    setLoading(true)

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

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
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      updateLastAssistantMessage('Sorry, something went wrong. Please try again.')
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
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">AI Assistant</h2>
        <button
          onClick={() => {
            chatApi.clearHistory().then(() => setMessages([]))
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Ask me to manage your tasks! e.g. "Add a high-priority task: Review Q3 Report"
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message AI... (Enter to send)"
            rows={2}
            disabled={isLoading}
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
