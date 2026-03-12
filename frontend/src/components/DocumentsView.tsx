import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useDeleteDocument, useDocuments, useUploadDocument } from '@/hooks/useDocuments'
import type { Document } from '@/lib/api'

function DocCard({ doc }: { doc: Document }) {
  const deleteDoc = useDeleteDocument()
  const [expanded, setExpanded] = useState(false)

  const previewLen = 140
  const isLong = doc.summary.length > previewLen
  const displaySummary = expanded || !isLong ? doc.summary : doc.summary.slice(0, previewLen) + '…'

  return (
    <div className="group rounded-lg border border-border bg-surface p-4 transition-all hover:border-border/60 hover:bg-surface-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate text-sm font-semibold">{doc.filename}</span>
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {doc.file_type}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {displaySummary}
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 font-mono text-[10px] text-primary hover:text-primary/80"
              >
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </p>
          <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-muted-foreground/50">
            <span>{doc.char_count.toLocaleString()} chars</span>
            <span>·</span>
            <span>{doc.chunk_count} chunks</span>
            <span>·</span>
            <span>ID {doc.id}</span>
          </div>
        </div>

        <button
          onClick={() => deleteDoc.mutate(doc.id)}
          disabled={deleteDoc.isPending}
          className="shrink-0 text-transparent transition-all group-hover:text-muted-foreground/40 hover:!text-red-400 disabled:opacity-40"
          title="Delete document"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default function DocumentsView() {
  const { data: docs = [], isLoading } = useDocuments()
  const uploadDoc = useUploadDocument()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      if (file.name.endsWith('.txt') || file.name.endsWith('.docx') || file.name.endsWith('.pdf')) {
        uploadDoc.mutate(file)
      }
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'mb-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 transition-all',
          dragging
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
          uploadDoc.isPending && 'pointer-events-none opacity-60'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.docx,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {uploadDoc.isPending ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="font-mono text-xs">Processing…</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="opacity-50">
              <path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 16v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-sm font-medium">Drop files here or click to upload</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/60">.txt · .docx · .pdf</p>
            </div>
          </div>
        )}
      </div>

      {uploadDoc.isError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 font-mono text-xs text-red-400">
          Upload failed. Check the file type and try again.
        </div>
      )}

      {/* Document library */}
      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border border-primary border-t-transparent" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2">
          <div className="font-mono text-2xl text-muted-foreground/20">∅</div>
          <p className="text-xs text-muted-foreground/40">
            No documents yet. Upload a .txt or .docx file.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  )
}
