import { useRef, useLayoutEffect, useState } from 'react'
import ChatPanel from './components/ChatPanel'
import TaskPanel from './components/TaskPanel'

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
      <div
        className="mode-toggle-indicator"
        style={{ left: indicator.left, width: indicator.width }}
      />
      <button
        ref={manualRef}
        onClick={() => onChange('manual')}
        className={`mode-toggle-btn ${mode === 'manual' ? 'active' : 'inactive'}`}
      >
        Manual
      </button>
      <button
        ref={aiRef}
        onClick={() => onChange('ai')}
        className={`mode-toggle-btn ${mode === 'ai' ? 'active' : 'inactive'}`}
      >
        AI Chat
      </button>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('manual')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-sm bg-primary" />
          <span className="font-mono text-xs font-500 tracking-[0.15em] text-muted-foreground uppercase">
            TaskFlow
          </span>
          <span className="font-mono text-xs text-primary/60">AI</span>
        </div>

        <ModeToggle mode={mode} onChange={setMode} />

        <div className="font-mono text-[10px] tracking-widest text-muted-foreground/40 uppercase select-none">
          {mode === 'manual' ? 'Task Manager' : 'Assistant'}
        </div>
      </header>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {mode === 'manual' ? (
          <div key="manual" className="flex flex-1 animate-slide-in-left overflow-hidden">
            <TaskPanel mode="manual" />
          </div>
        ) : (
          <div key="ai" className="flex flex-1 animate-slide-in-right overflow-hidden">
            {/* Compact task sidebar */}
            <aside className="flex w-72 shrink-0 flex-col border-r border-border">
              <TaskPanel mode="compact" />
            </aside>
            {/* Chat panel */}
            <main className="flex flex-1 flex-col overflow-hidden">
              <ChatPanel onSwitchMode={() => setMode('manual')} />
            </main>
          </div>
        )}
      </div>
    </div>
  )
}
