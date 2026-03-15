/**
 * Authentication Store
 * Zustand store for managing authentication state.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authService, User, Token, LoginRequest, RegisterRequest } from '../services/auth'

interface AuthState {
  // State
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  login: (data: LoginRequest) => Promise<void>
  register: (data: RegisterRequest) => Promise<void>
  logout: () => void
  refreshAccessToken: () => Promise<boolean>
  fetchUser: () => Promise<void>
  clearError: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Login action
      login: async (data: LoginRequest) => {
        set({ isLoading: true, error: null })
        try {
          const tokens = await authService.login(data)
          
          // Store tokens
          localStorage.setItem('auth_token', tokens.access_token)
          
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            isAuthenticated: true,
            isLoading: false,
          })
          
          // Fetch user profile
          await get().fetchUser()
        } catch (error: any) {
          const message = error.response?.data?.detail || 'Login failed'
          set({ isLoading: false, error: message })
          throw error
        }
      },

      // Register action
      register: async (data: RegisterRequest) => {
        set({ isLoading: true, error: null })
        try {
          await authService.register(data)
          set({ isLoading: false })
          
          // Auto-login after registration
          await get().login({
            username: data.email,
            password: data.password,
          })
        } catch (error: any) {
          const message = error.response?.data?.detail || 'Registration failed'
          set({ isLoading: false, error: message })
          throw error
        }
      },

      // Logout action
      logout: () => {
        localStorage.removeItem('auth_token')
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          error: null,
        })
      },

      // Refresh token action
      refreshAccessToken: async () => {
        const { refreshToken } = get()
        if (!refreshToken) return false
        
        try {
          const tokens = await authService.refresh(refreshToken)
          localStorage.setItem('auth_token', tokens.access_token)
          
          set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
          })
          return true
        } catch (error) {
          get().logout()
          return false
        }
      },

      // Fetch user profile
      fetchUser: async () => {
        try {
          const user = await authService.getMe()
          set({ user, isAuthenticated: true })
        } catch (error) {
          get().logout()
        }
      },

      // Clear error
      clearError: () => set({ error: null }),
      
      // Set loading
      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

export default useAuthStore
