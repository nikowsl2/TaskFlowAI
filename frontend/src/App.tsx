import ChatPanel from './components/ChatPanel'
import TaskPanel from './components/TaskPanel'

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Task panel — left */}
      <aside className="flex w-[420px] shrink-0 flex-col border-r border-border">
        <TaskPanel />
      </aside>

      {/* Chat panel — right */}
      <main className="flex flex-1 flex-col">
        <ChatPanel />
      </main>
    </div>
  )
}
