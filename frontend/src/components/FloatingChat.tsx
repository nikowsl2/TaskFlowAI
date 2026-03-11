import { useState } from 'react'
import ChatPanel from './ChatPanel'

export default function FloatingChat() {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Panel */}
      {open && (
        <div
          className="float-shadow flex w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-background animate-fade-up"
          style={{ height: '480px' }}
        >
          <ChatPanel onClose={() => setOpen(false)} floating />
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open AI chat'}
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground float-shadow transition-all hover:scale-105 active:scale-95"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 5a2 2 0 012-2h10a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V5z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
