import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useProfile, useUpdateProfile } from '../hooks/useProfile'
import { UserProfileUpdate } from '../lib/api'

const FIELDS: { key: keyof UserProfileUpdate; label: string; shortLabel: string }[] = [
  { key: 'role_and_goals', label: 'Role & Goals', shortLabel: 'Role' },
  { key: 'preferences', label: 'Preferences', shortLabel: 'Prefs' },
  { key: 'current_focus', label: 'Current Focus', shortLabel: 'Focus' },
  { key: 'extra_notes', label: 'Extra Notes', shortLabel: 'Notes' },
]

export function ProfileView({ compact }: { compact?: boolean }) {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()

  const [form, setForm] = useState<UserProfileUpdate>({
    role_and_goals: '',
    preferences: '',
    current_focus: '',
    extra_notes: '',
  })
  const [saved, setSaved] = useState(false)
  const [expandedField, setExpandedField] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setForm({
        role_and_goals: profile.role_and_goals ?? '',
        preferences: profile.preferences ?? '',
        current_focus: profile.current_focus ?? '',
        extra_notes: profile.extra_notes ?? '',
      })
    }
  }, [profile])

  const handleSave = () => {
    const payload: UserProfileUpdate = {}
    ;(Object.keys(form) as (keyof UserProfileUpdate)[]).forEach((k) => {
      payload[k] = (form[k] as string) || null
    })
    updateProfile.mutate(payload, {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      },
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <div className={cn(
          'animate-spin rounded-full border border-primary border-t-transparent',
          compact ? 'h-3.5 w-3.5' : 'h-4 w-4'
        )} />
      </div>
    )
  }

  // ── Compact (sidebar) ───────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Profile
          </span>
          <button
            onClick={handleSave}
            disabled={updateProfile.isPending}
            className={cn(
              'text-[10px] font-semibold transition-colors',
              saved
                ? 'text-emerald-400'
                : 'text-primary hover:text-primary/80'
            )}
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {FIELDS.map(({ key, shortLabel }) => {
            const value = (form[key] as string) ?? ''
            const isOpen = expandedField === key
            const hasContent = value.trim().length > 0

            return (
              <div key={key} className="border-b border-border/60 last:border-0">
                <div
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-surface-2',
                    isOpen && 'bg-surface-2'
                  )}
                  onClick={() => setExpandedField(isOpen ? null : key)}
                >
                  <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                    {shortLabel}
                  </span>
                  {!isOpen && hasContent && (
                    <span className="max-w-[60%] truncate text-[10px] text-muted-foreground/40">
                      {value}
                    </span>
                  )}
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    className={cn(
                      'shrink-0 text-muted-foreground/30 transition-transform',
                      isOpen && 'rotate-180'
                    )}
                  >
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {isOpen && (
                  <div className="bg-surface-2 px-3 pb-3">
                    <textarea
                      className="w-full rounded border border-border bg-surface px-2.5 py-2 text-[11px] leading-relaxed resize-none outline-none focus:border-primary/40 placeholder:text-muted-foreground/25"
                      rows={3}
                      placeholder={`Enter ${shortLabel.toLowerCase()}…`}
                      value={value}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {profile?.updated_at && (
          <div className="border-t border-border px-3 py-2">
            <p className="text-center text-[9px] text-muted-foreground/30">
              Updated {new Date(profile.updated_at).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    )
  }

  // ── Full (manual mode) ─────────────────────────────────────────────────
  const isEmpty =
    !profile?.role_and_goals &&
    !profile?.preferences &&
    !profile?.current_focus &&
    !profile?.extra_notes

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-bold">User Profile</h2>
      {isEmpty && (
        <p className="text-sm text-muted-foreground">
          Your profile is empty. Start chatting and the AI will fill this in automatically.
        </p>
      )}
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            {label}
          </label>
          <textarea
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed resize-none outline-none transition-colors focus:border-primary/40 placeholder:text-muted-foreground/25"
            rows={3}
            value={(form[key] as string) ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={updateProfile.isPending}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-bold transition-all',
            saved
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40'
          )}
        >
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
      {profile?.updated_at && (
        <p className="text-xs text-muted-foreground/50">
          Last updated: {new Date(profile.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
