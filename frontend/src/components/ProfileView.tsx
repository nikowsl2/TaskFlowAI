import { useState, useEffect } from 'react'
import { useProfile, useUpdateProfile } from '../hooks/useProfile'
import { UserProfileUpdate } from '../lib/api'

export function ProfileView() {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()

  const [form, setForm] = useState<UserProfileUpdate>({
    role_and_goals: '',
    preferences: '',
    current_focus: '',
    extra_notes: '',
  })
  const [saved, setSaved] = useState(false)

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

  if (isLoading) return <div className="p-4 text-gray-400">Loading...</div>

  const isEmpty =
    !profile?.role_and_goals &&
    !profile?.preferences &&
    !profile?.current_focus &&
    !profile?.extra_notes

  const fields: { key: keyof UserProfileUpdate; label: string }[] = [
    { key: 'role_and_goals', label: 'Role & Goals' },
    { key: 'preferences', label: 'Preferences' },
    { key: 'current_focus', label: 'Current Focus' },
    { key: 'extra_notes', label: 'Extra Notes' },
  ]

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold text-gray-100">User Profile</h2>
      {isEmpty && (
        <p className="text-sm text-gray-400">
          Your profile is empty. Start chatting and the AI will fill this in automatically.
        </p>
      )}
      {fields.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {label}
          </label>
          <textarea
            className="w-full rounded bg-gray-800 border border-gray-700 text-gray-100 text-sm p-2 resize-none focus:outline-none focus:border-blue-500"
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
          className="px-4 py-2 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
        >
          Save
        </button>
        {saved && <span className="text-sm text-green-400">Saved</span>}
      </div>
      {profile?.updated_at && (
        <p className="text-xs text-gray-500">
          Last updated: {new Date(profile.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
