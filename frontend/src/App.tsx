import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import FloatingChat from './components/FloatingChat'
import TaskPanel from './components/TaskPanel'
import { useThemeStore } from './store/themeStore'

type Mode = 'manual' | 'ai'

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const manualRef = useRef<HTMLButtonElement>(null)
  const aiRef = useRef<HTMLButtonElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })

  useLayoutEffect(() => {
    const btn = mode === 'manual' ? manualRef.current : aiRef.current
    if (!btn) return
    const parent = btn.parentElement!
    const parentRect = parent.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setIndicator({ left: btnRect.left - parentRect.left - 3, width: btnRect.width })
  }, [mode])

  return (
    <div className="mode-toggle">
      <div className="mode-toggle-indicator" style={{ left: indicator.left, width: indicator.width }} />
      <button ref={manualRef} onClick={() => onChange('manual')} className={`mode-toggle-btn ${mode === 'manual' ? 'active' : 'inactive'}`}>
        Manual
      </button>
      <button ref={aiRef} onClick={() => onChange('ai')} className={`mode-toggle-btn ${mode === 'ai' ? 'active' : 'inactive'}`}>
        AI Chat
      </button>
    </div>
  )
}

function ThemeToggle() {
  const { theme, toggle } = useThemeStore()
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
    >
      {theme === 'dark' ? (
        // Sun
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.9 2.9l1.1 1.1M10 10l1.1 1.1M2.9 11.1L4 10M10 4l1.1-1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ) : (
        // Moon
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12 8.5A5.5 5.5 0 015.5 2a5.5 5.5 0 100 10 5.5 5.5 0 006.5-3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('manual')
  const { theme } = useThemeStore()

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-sm bg-primary" />
          <span className="font-mono text-[11px] font-bold tracking-[0.15em] text-muted-foreground uppercase">
            TaskFlow
          </span>
          <span className="font-mono text-[11px] text-primary/60">AI</span>
        </div>

        <ModeToggle mode={mode} onChange={setMode} />

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <div className="relative flex flex-1 overflow-hidden">
        {mode === 'manual' && (
          <div key="manual" className="flex flex-1 animate-slide-in-left overflow-hidden">
            <TaskPanel mode="manual" />
          </div>
        )}

        {mode === 'ai' && (
          <div key="ai" className="flex flex-1 animate-slide-in-right overflow-hidden">
            {/* Accordion task menu */}
            <aside className="flex w-64 shrink-0 flex-col border-r border-border">
              <TaskPanel mode="menu" />
            </aside>
            {/* Chat panel */}
            <main className="flex flex-1 flex-col overflow-hidden">
              <ChatPanel onSwitchMode={() => setMode('manual')} />
            </main>
          </div>
        )}

        {/* Floating chat — only in manual mode */}
        {mode === 'manual' && <FloatingChat />}
      </div>
    </div>
  )
}
