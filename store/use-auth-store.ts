import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "@/types/auth"

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User | null) => void
  setUser: (user: User | null) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
      isAuthenticated: () => !!get().token,
    }),
    { name: "practo-cms-auth", partialize: (s) => ({ token: s.token, user: s.user }) }
  )
)
