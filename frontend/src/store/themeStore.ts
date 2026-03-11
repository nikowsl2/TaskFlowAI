import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  theme: 'dark' | 'light'
  toggle: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      toggle: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'taskflow-theme' }
  )
)
