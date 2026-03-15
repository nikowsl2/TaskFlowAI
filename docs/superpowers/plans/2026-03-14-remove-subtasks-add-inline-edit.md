# Remove Subtasks & Add Inline Task Editing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the subtask (parent-child) concept entirely from both backend and frontend, then add click-to-edit for all task fields in the Manual mode List view.

**Architecture:** Two-phase change. Phase 1 removes `parent_id`, `subtasks` relationship, and all subtask UI/logic. Phase 2 adds inline editing to `TaskCard` in `TaskPanel.tsx` — clicking title/description switches to input, and priority/due-date controls are added to the card. The backend already supports PATCH for all fields, so no new endpoints are needed.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, React 18, TypeScript, Tailwind CSS, Zustand, React Query

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/models.py` | Modify | Remove `parent_id`, `subtasks`, `parent` from Task |
| `backend/app/schemas.py` | Modify | Remove `parent_id` from TaskCreate/TaskOut, `subtasks` from TaskOut |
| `backend/app/routers/tasks.py` | Modify | Remove `parent_id IS NULL` filter from list query |
| `backend/app/ai/tools.py` | Modify | Remove `parent_id` from CreateTaskInput, tool schema, and dispatch logic |
| `backend/app/main.py` | Modify | Add migration to drop `parent_id` column |
| `frontend/src/lib/api.ts` | Modify | Remove `parent_id`/`subtasks` from Task, `parent_id` from TaskCreate |
| `frontend/src/components/TaskPanel.tsx` | Modify | Remove SubtaskRow, subtask rendering; add click-to-edit to TaskCard |
| `frontend/src/components/CalendarView.tsx` | Modify | Remove `flattenTasks`, `parent_id` reference in DayView |
| `README.md` | Modify | Remove subtask/parent-child mentions |

---

## Chunk 1: Remove Subtasks from Backend

### Task 1: Remove subtask fields from SQLAlchemy model

**Files:**
- Modify: `backend/app/models.py:18-33`

- [ ] **Step 1: Remove parent_id, subtasks, and parent from Task model**

Replace lines 18-33 in `models.py` (the `parent_id` column, `subtasks` relationship, and `parent` relationship) with nothing — just delete those lines entirely.

Before:
```python
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True
    )
    ...
    subtasks: Mapped[list["Task"]] = relationship(
        "Task",
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    parent: Mapped["Task | None"] = relationship(
        "Task", back_populates="subtasks", remote_side=[id]
    )
```

After: (those 3 fields are simply removed — no replacement)

Also remove `ForeignKey` from the import if no other usage remains:
```python
from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
```

- [ ] **Step 2: Verify model compiles**

Run: `cd /Users/shilinwang/Desktop/TaskFlowAI/backend && python -c "from app.models import Task; print('OK')"`
Expected: `OK`

### Task 2: Remove subtask fields from Pydantic schemas

**Files:**
- Modify: `backend/app/schemas.py:65-96`

- [ ] **Step 1: Remove parent_id from TaskCreate**

Remove `parent_id: int | None = None` (line 70).

- [ ] **Step 2: Remove parent_id and subtasks from TaskOut**

Remove `parent_id: int | None` (line 88) and `subtasks: list[TaskOut] = []` (line 91).

- [ ] **Step 3: Remove TaskOut.model_rebuild() call**

Delete line 96 (`TaskOut.model_rebuild()`) — this was only needed for the self-referential `subtasks` field.

- [ ] **Step 4: Verify schemas compile**

Run: `cd /Users/shilinwang/Desktop/TaskFlowAI/backend && python -c "from app.schemas import TaskCreate, TaskOut; print('OK')"`
Expected: `OK`

### Task 3: Remove parent_id filter from task router

**Files:**
- Modify: `backend/app/routers/tasks.py:13`

- [ ] **Step 1: Remove the parent_id filter from list_tasks**

Change line 13:
```python
# Before
return db.query(Task).filter(Task.parent_id.is_(None)).all()
# After
return db.query(Task).all()
```

### Task 4: Remove subtask logic from AI tools

**Files:**
- Modify: `backend/app/ai/tools.py:29-34,137-170,249,529-538,551,565`

- [ ] **Step 1: Remove parent_id from CreateTaskInput**

Remove `parent_id: int | None = None` from the `CreateTaskInput` class (line 34).

- [ ] **Step 2: Remove parent_id from create_task tool definition**

Remove the `"parent_id"` property block from `TOOL_DEFINITIONS[0]` (lines 166-169):
```python
                    "parent_id": {
                        "type": "integer",
                        "description": "ID of parent task if this is a subtask",
                    },
```

- [ ] **Step 3: Update delete_task description**

Change line 249:
```python
# Before
"description": "Permanently delete a task and all its subtasks.",
# After
"description": "Permanently delete a task.",
```

- [ ] **Step 4: Remove parent_id validation and assignment from create_task dispatch**

Remove lines 529-538 (the parent_id validation block and its assignment in Task creation):
```python
        if inp.parent_id is not None:
            parent = db.get(Task, inp.parent_id)
            if not parent:
                return ToolResult(ok=False, message=f"Parent task #{inp.parent_id} not found.")
```

And remove `parent_id=inp.parent_id,` from the Task constructor.

- [ ] **Step 5: Remove parent_id filter from list_tasks dispatch**

Change line 551:
```python
# Before
query = db.query(Task).filter(Task.parent_id.is_(None))
# After
query = db.query(Task)
```

- [ ] **Step 6: Remove subtask_count from list_tasks response**

Remove `"subtask_count": len(t.subtasks),` from the task_list comprehension (line 565).

### Task 5: Add migration to drop parent_id column

**Files:**
- Modify: `backend/app/main.py:25-47`

- [ ] **Step 1: Add migration block in lifespan to rebuild tasks table without parent_id**

SQLite doesn't support `ALTER TABLE DROP COLUMN` in older versions. Add after the existing migration blocks (before `Base.metadata.create_all`):

```python
        # Drop parent_id column from tasks table (SQLite rebuild)
        try:
            # Check if column exists first
            result = conn.execute(text("PRAGMA table_info(tasks)"))
            columns = [row[1] for row in result]
            if "parent_id" in columns:
                conn.execute(text("""
                    CREATE TABLE tasks_new (
                        id INTEGER PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        completed BOOLEAN DEFAULT 0,
                        priority VARCHAR(10) DEFAULT 'medium',
                        due_date DATETIME,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO tasks_new (id, title, description, completed, priority, due_date, created_at, updated_at)
                    SELECT id, title, description, completed, priority, due_date, created_at, updated_at
                    FROM tasks
                """))
                conn.execute(text("DROP TABLE tasks"))
                conn.execute(text("ALTER TABLE tasks_new RENAME TO tasks"))
                conn.commit()
        except OperationalError:
            pass
```

- [ ] **Step 2: Verify backend starts**

Run: `cd /Users/shilinwang/Desktop/TaskFlowAI/backend && python -c "from app.main import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Run ruff check**

Run: `cd /Users/shilinwang/Desktop/TaskFlowAI/backend && ruff check app/models.py app/schemas.py app/routers/tasks.py app/ai/tools.py app/main.py`
Expected: No new errors (pre-existing E501s are ok)

- [ ] **Step 4: Commit backend subtask removal**

```bash
git add backend/app/models.py backend/app/schemas.py backend/app/routers/tasks.py backend/app/ai/tools.py backend/app/main.py
git commit -m "refactor: remove subtask (parent-child) concept from backend"
```

---

## Chunk 2: Remove Subtasks from Frontend

### Task 6: Remove subtask types from API client

**Files:**
- Modify: `frontend/src/lib/api.ts:7-26`

- [ ] **Step 1: Remove parent_id and subtasks from Task interface**

```typescript
// Before
export interface Task {
  id: number
  title: string
  description: string | null
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  parent_id: number | null
  created_at: string
  updated_at: string
  subtasks: Task[]
}

// After
export interface Task {
  id: number
  title: string
  description: string | null
  completed: boolean
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Remove parent_id from TaskCreate interface**

```typescript
// Before
export interface TaskCreate {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  due_date?: string
  parent_id?: number
}

// After
export interface TaskCreate {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high'
  due_date?: string
}
```

### Task 7: Remove subtask UI from TaskPanel

**Files:**
- Modify: `frontend/src/components/TaskPanel.tsx:257-301,356-362`

- [ ] **Step 1: Delete the SubtaskRow component entirely**

Remove lines 282-301 (the `SubtaskRow` function).

- [ ] **Step 2: Remove subtask rendering from MenuTaskItem**

Remove lines 257-264 (the subtasks block in the accordion expanded details):
```tsx
          {/* Subtasks */}
          {task.subtasks?.length > 0 && (
            <div className="mb-2.5 space-y-1 border-l-2 border-border/40 pl-3">
              {task.subtasks.map((sub) => (
                <SubtaskRow key={sub.id} task={sub} />
              ))}
            </div>
          )}
```

- [ ] **Step 3: Remove subtask rendering from TaskCard**

Remove lines 356-362 (the subtasks block in the task card):
```tsx
          {task.subtasks?.length > 0 && (
            <div className="mt-2 space-y-1 border-l-2 border-border/40 pl-3">
              {task.subtasks.map((sub) => (
                <SubtaskRow key={sub.id} task={sub} />
              ))}
            </div>
          )}
```

### Task 8: Remove subtask logic from CalendarView

**Files:**
- Modify: `frontend/src/components/CalendarView.tsx:40-42,314-316,344-345`

- [ ] **Step 1: Remove the flattenTasks function**

Delete lines 40-42:
```typescript
function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...flattenTasks(t.subtasks ?? [])])
}
```

- [ ] **Step 2: Remove parent_id "subtask" label from DayView**

Delete lines 314-316:
```tsx
                  {t.parent_id && (
                    <p className="mt-1 font-mono text-[9px] text-muted-foreground/40">subtask</p>
                  )}
```

- [ ] **Step 3: Update CalendarView to use tasks directly instead of flattenTasks**

Change lines 344-345:
```typescript
// Before
const allTasks = useMemo(() => flattenTasks(tasks), [tasks])
const tasksWithDeadline = useMemo(() => allTasks.filter((t) => t.due_date), [allTasks])

// After
const tasksWithDeadline = useMemo(() => tasks.filter((t) => t.due_date), [tasks])
```

Also update line 400 — change `allTasks` to `tasks`:
```typescript
// Before
const noDeadlineCount = allTasks.filter((t) => !t.due_date && !t.completed).length
// After
const noDeadlineCount = tasks.filter((t) => !t.due_date && !t.completed).length
```

- [ ] **Step 4: Run frontend lint**

Run: `cd /Users/shilinwang/Desktop/TaskFlowAI/frontend && npx tsc --noEmit`
Expected: No new type errors

- [ ] **Step 5: Commit frontend subtask removal**

```bash
git add frontend/src/lib/api.ts frontend/src/components/TaskPanel.tsx frontend/src/components/CalendarView.tsx
git commit -m "refactor: remove subtask UI and types from frontend"
```

---

## Chunk 3: Add Click-to-Edit in Manual Mode TaskCard

### Task 9: Add inline editing to TaskCard

**Files:**
- Modify: `frontend/src/components/TaskPanel.tsx:306-381`

- [ ] **Step 1: Rewrite TaskCard with click-to-edit for title, description, priority, and due date**

Replace the existing `TaskCard` component with this version that adds inline editing:

```tsx
function TaskCard({ task, highlighted }: { task: Task; highlighted?: boolean }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const ref = useRef<HTMLDivElement>(null)

  const [editingTitle, setEditingTitle] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)
  const [descVal, setDescVal] = useState(task.description ?? '')

  // Sync with external updates (e.g. from AI agent)
  useEffect(() => { setTitleVal(task.title) }, [task.title])
  useEffect(() => { setDescVal(task.description ?? '') }, [task.description])

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlighted])

  const saveTitle = () => {
    setEditingTitle(false)
    const trimmed = titleVal.trim()
    if (trimmed && trimmed !== task.title) {
      updateTask.mutate({ id: task.id, data: { title: trimmed } })
    } else {
      setTitleVal(task.title)
    }
  }

  const saveDesc = () => {
    setEditingDesc(false)
    const trimmed = descVal.trim()
    if (trimmed !== (task.description ?? '')) {
      updateTask.mutate({ id: task.id, data: { description: trimmed || undefined } })
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'group relative rounded-lg border border-border bg-surface p-4 transition-all hover:border-border/60 hover:bg-surface-2',
        task.completed && 'opacity-60',
        highlighted && 'ring-2 ring-primary/50 border-primary/40'
      )}
    >
      {/* Priority stripe */}
      <div className={cn('absolute left-0 top-4 bottom-4 w-0.5 rounded-full', PRIORITY_DOT[task.priority])} />

      <div className="ml-3.5 flex items-start gap-3">
        <button
          onClick={() => updateTask.mutate({ id: task.id, data: { completed: !task.completed } })}
          className={cn(
            'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-all',
            task.completed
              ? 'border-primary/60 bg-primary/15 text-primary'
              : 'border-border text-transparent hover:border-primary/60'
          )}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M1.5 4.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          {/* Title — click to edit */}
          {editingTitle ? (
            <input
              autoFocus
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') { setTitleVal(task.title); setEditingTitle(false) }
              }}
              className="w-full bg-transparent text-sm font-semibold leading-snug outline-none ring-1 ring-primary/40 rounded px-1 -ml-1"
            />
          ) : (
            <p
              onClick={() => !task.completed && setEditingTitle(true)}
              className={cn(
                'text-sm font-semibold leading-snug',
                task.completed ? 'line-through text-muted-foreground' : 'cursor-text hover:text-primary transition-colors'
              )}
            >
              {task.title}
            </p>
          )}

          {/* Description — click to edit (or click to add) */}
          {editingDesc ? (
            <textarea
              autoFocus
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              onBlur={saveDesc}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setDescVal(task.description ?? ''); setEditingDesc(false) }
              }}
              rows={2}
              className="mt-1 w-full resize-none bg-transparent text-xs leading-relaxed text-muted-foreground outline-none ring-1 ring-primary/40 rounded px-1 -ml-1"
            />
          ) : (
            <p
              onClick={() => !task.completed && setEditingDesc(true)}
              className={cn(
                'mt-0.5 text-xs leading-relaxed',
                task.description
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/30 italic',
                !task.completed && 'cursor-text hover:text-muted-foreground/80 transition-colors'
              )}
            >
              {task.description || (task.completed ? '' : 'Add description…')}
            </p>
          )}

          {/* Due date + Priority controls — visible on hover */}
          <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Priority buttons */}
            <div className="flex items-center gap-1">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => updateTask.mutate({ id: task.id, data: { priority: p } })}
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-all',
                    task.priority === p
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted-foreground/30 hover:text-muted-foreground'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Due date picker */}
            <input
              type="date"
              value={task.due_date ? task.due_date.split('T')[0] : ''}
              onChange={(e) => {
                const val = e.target.value
                updateTask.mutate({ id: task.id, data: { due_date: val ? `${val}T00:00:00` : null } })
              }}
              className="rounded border border-border/60 bg-transparent px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground outline-none [color-scheme:dark]"
            />
          </div>

          {/* Due date display — always visible when set (controls hidden) */}
          {task.due_date && (
            <p className="mt-1.5 font-mono text-[10px] text-primary/60 group-hover:hidden">
              DUE {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground/50 uppercase group-hover:hidden">
            {task.priority[0]}
          </span>
          <button
            onClick={() => deleteTask.mutate(task.id)}
            className="text-transparent transition-all group-hover:text-muted-foreground/40 hover:!text-red-400"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add useEffect to TaskPanel imports if not present**

Ensure the import line at the top of `TaskPanel.tsx` includes `useEffect`:
```typescript
import { useEffect, useRef, useState } from 'react'
```
(It's already imported, so this should be a no-op.)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/shilinwang/Desktop/TaskFlowAI/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit inline editing**

```bash
git add frontend/src/components/TaskPanel.tsx
git commit -m "feat: add click-to-edit for task title, description, priority, and due date"
```

---

## Chunk 4: Update README

### Task 10: Remove subtask mentions from README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Remove subtask/parent-child mentions**

Remove or rewrite these specific items:
- In "Task Management" section: remove "Subtask hierarchy with parent-child relationships"
- In "AI Tools" table: remove `parent` mention from `create_task` description — change to "Create a task with title, priority, and due date"
- In "AI Tools" table: update `delete_task` description — change to "Delete a task by ID"

- [ ] **Step 2: Add inline editing mention**

In the "Task Management" section, add:
- "Inline editing — click any task field to edit title, description, priority, or deadline"

- [ ] **Step 3: Commit README update**

```bash
git add README.md
git commit -m "docs: update README — remove subtask references, add inline editing"
```

---

## Verification

After all commits:

1. `cd backend && ruff check app/` — no new lint errors
2. `cd frontend && npx tsc --noEmit` — no type errors
3. Manual test: start backend + frontend, create a task, click title to edit, click description to add/edit, change priority and due date from the card
4. Manual test: verify the AI agent can still create/list/update/delete tasks without errors (no subtask references in tool calls)
