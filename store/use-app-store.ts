import { create } from "zustand"

interface AppState {
  // Example state - add your own as needed
  isLoading: boolean
  setLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
}))
