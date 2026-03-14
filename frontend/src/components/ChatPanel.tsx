import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { chatApi, meetingApi } from '@/lib/api'
import { useChatStore, type AttachmentLabel } from '@/store/chatStore'
import { useAttachmentStore, type ContextItem } from '@/store/attachmentStore'
import { EmailDraftCard, type EmailDraftData } from './EmailDraftCard'
import ContextPicker from './ContextPicker'

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

function MessageBubble({ role, content, attachments }: { role: string; content: string; attachments?: AttachmentLabel[] }) {
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
        {isUser && attachments && attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {attachments.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/15 px-1.5 py-0.5 text-[10px]"
              >
                <span>{CHIP_ICONS[a.type] ?? '📎'}</span>
                <span className="max-w-[100px] truncate">{a.label}</span>
              </span>
            ))}
          </div>
        )}
        <pre className="whitespace-pre-wrap font-sans text-[13px]">{content}</pre>
      </div>
    </div>
  )
}

const CHIP_ICONS: Record<string, string> = {
  task: '☑',
  note: '📝',
  email_draft: '✉',
  document: '📄',
  project: '📁',
  file: '📄',
}

const SUGGESTIONS = [
  'Process these notes: "Finish slides by Friday. Team sync next Monday at 10am."',
  'Draft an email to Bob saying I\'m free for a sync tomorrow at 2pm',
  'Add a high-priority task: Review Q3 report',
  'Schedule a team meeting for tomorrow at 2pm',
]

function getChipLabel(item: ContextItem): string {
  switch (item.type) {
    case 'task': return item.title
    case 'note': return item.title
    case 'email_draft': return item.subject
    case 'document': return item.title
    case 'project': return item.name
  }
}

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
  const [pickerOpen, setPickerOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const pickerContainerRef = useRef<HTMLDivElement>(null)

  const briefTriggeredRef = useRef(false)

  const { contextItems, files, addFile, removeContextItem, removeFile, clearAll } =
    useAttachmentStore()
  const hasAttachments = contextItems.length > 0 || files.length > 0

  // Close picker on click outside
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      if (pickerContainerRef.current && !pickerContainerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  // Close picker on Escape
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [pickerOpen])

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
      if (!res.ok || !res.body) {
        useChatStore.setState((s) => ({ messages: s.messages.filter((m) => m.id !== briefId) }))
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let sseBuffer = ''
      let succeeded = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() ?? ''
        let eventData = ''
        for (const rawLine of lines) {
          const line = rawLine.trimEnd()
          if (line.startsWith('data: ')) {
            eventData += (eventData ? '\n' : '') + line.slice(6)
          } else if (line === '' && eventData) {
            try {
              const data = JSON.parse(eventData)
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
            eventData = ''
          }
        }
        if (eventData) {
          sseBuffer = 'data: ' + eventData + '\n' + sseBuffer
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
      if (shouldTriggerBrief() && !briefTriggeredRef.current) {
        briefTriggeredRef.current = true
        triggerMorningBrief()
      }
    }).catch((err) => {
      console.error('Failed to load chat history:', err)
    })
  }, [setMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    e.target.value = ''

    try {
      let content: string
      if (file.name.endsWith('.txt') || file.type === 'text/plain') {
        content = await file.text()
      } else {
        // Use parseFile API for .docx, .pdf, etc.
        const result = await meetingApi.parseFile(file)
        content = result.text
      }
      addFile({ id: `file-${Date.now()}`, name: file.name, content })
    } catch (err) {
      console.error('Failed to read file:', err)
    }
  }

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isLoading) return
    setInput('')
    setPickerOpen(false)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Capture current attachments before clearing
    const attachedContext = [...contextItems]
    const attachedFiles = [...files]
    clearAll()

    // Build attachment labels for display in the user bubble
    const attachmentLabels: AttachmentLabel[] = [
      ...attachedContext.map((item) => ({ type: item.type, label: getChipLabel(item) })),
      ...attachedFiles.map((f) => ({ type: 'file', label: f.name })),
    ]

    addMessage({
      id: Date.now().toString(),
      role: 'user',
      content: msg,
      ...(attachmentLabels.length > 0 && { attachments: attachmentLabels }),
    })
    addMessage({ id: (Date.now() + 1).toString(), role: 'assistant', content: '' })
    setLoading(true)

    try {
      const body: Record<string, unknown> = { content: msg }
      if (attachedContext.length > 0) body.context = attachedContext
      if (attachedFiles.length > 0)
        body.files = attachedFiles.map((f) => ({ name: f.name, content: f.content }))

      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Server error (${res.status})`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })
        // Parse SSE line-by-line: events are delimited by blank lines.
        // Each "data: ..." line within an event contributes to its payload.
        const lines = sseBuffer.split('\n')
        // Keep the last incomplete line in the buffer
        sseBuffer = lines.pop() ?? ''
        let eventData = ''
        for (const rawLine of lines) {
          const line = rawLine.trimEnd()
          if (line.startsWith('data: ')) {
            eventData += (eventData ? '\n' : '') + line.slice(6)
          } else if (line === '' && eventData) {
            // Blank line = end of event
            try {
              const data = JSON.parse(eventData)
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
            } catch { /* ignore malformed JSON */ }
            eventData = ''
          }
        }
        // If there's remaining eventData with no trailing blank line,
        // prepend it back to the buffer so the next chunk picks it up
        if (eventData) {
          sseBuffer = 'data: ' + eventData + '\n' + sseBuffer
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
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              ← Tasks
            </button>
          )}
          <button
            onClick={() => chatApi.clearHistory().then(() => setMessages([]))}
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/40 transition-colors hover:text-muted-foreground"
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
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} attachments={msg.attachments} />
              )
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="relative" ref={pickerContainerRef}>
          {/* Context picker popover */}
          {pickerOpen && <ContextPicker />}

          {/* Chip bar */}
          {hasAttachments && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {contextItems.map((item) => (
                <span
                  key={`${item.type}-${item.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-foreground"
                >
                  <span className="text-[10px]">{CHIP_ICONS[item.type]}</span>
                  <span className="max-w-[120px] truncate">{getChipLabel(item)}</span>
                  <button
                    onClick={() => removeContextItem(item.type, item.id)}
                    className="ml-0.5 text-muted-foreground/50 hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
              {files.map((file) => (
                <span
                  key={file.id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-foreground"
                >
                  <span className="text-[10px]">📄</span>
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="ml-0.5 text-muted-foreground/50 hover:text-foreground"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors focus-within:border-primary/40">
            {/* Tool buttons (hidden in floating mode) */}
            {!floating && (
              <>
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                    pickerOpen || hasAttachments
                      ? 'text-primary'
                      : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-surface-2'
                  )}
                  title="Attach context"
                >
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path
                      d="M13.5 6.5L7.5 12.5C6.17 13.83 4.08 13.83 2.75 12.5C1.42 11.17 1.42 9.08 2.75 7.75L8.75 1.75C9.58 0.92 10.92 0.92 11.75 1.75C12.58 2.58 12.58 3.92 11.75 4.75L5.75 10.75C5.34 11.16 4.66 11.16 4.25 10.75C3.84 10.34 3.84 9.66 4.25 9.25L9.5 4"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:text-muted-foreground hover:bg-surface-2"
                  title="Upload file"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 1v8M4 4l3-3 3 3M2.5 9v2.5a1 1 0 001 1h7a1 1 0 001-1V9"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  accept=".txt,.docx,.pdf"
                  onChange={handleFileAttach}
                />
              </>
            )}

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
        </div>
        {!floating && (
          <p className="mt-1 text-center text-[10px] font-medium text-muted-foreground/25">
            Enter to send · Shift+Enter for newline
          </p>
        )}
      </div>
    </div>
  )
}
