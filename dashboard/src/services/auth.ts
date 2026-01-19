/**
 * Authentication Service
 * Handles login, register, token refresh, and user profile API calls.
 */
import api from './api'

export interface LoginRequest {
  username: string  // Can be email or username
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
  full_name?: string
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface User {
  id: number
  email: string
  username: string
  full_name: string | null
  is_active: boolean
  is_superuser: boolean
  created_at: string
  updated_at: string
}

export interface PasswordChange {
  current_password: string
  new_password: string
}

export const authService = {
  /**
   * Login with email/username and password
   */
  login: async (data: LoginRequest): Promise<Token> => {
    // OAuth2 expects form data, not JSON
    const formData = new URLSearchParams()
    formData.append('username', data.username)
    formData.append('password', data.password)
    
    const response = await api.post<Token>('/auth/login', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return response.data
  },

  /**
   * Register a new user
   */
  register: async (data: RegisterRequest): Promise<User> => {
    const response = await api.post<User>('/auth/register', data)
    return response.data
  },

  /**
   * Refresh access token using refresh token
   */
  refresh: async (refreshToken: string): Promise<Token> => {
    const response = await api.post<Token>('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return response.data
  },

  /**
   * Get current user profile
   */
  getMe: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me')
    return response.data
  },

  /**
   * Update current user profile
   */
  updateMe: async (data: Partial<User>): Promise<User> => {
    const response = await api.put<User>('/auth/me', data)
    return response.data
  },

  /**
   * Change password
   */
  changePassword: async (data: PasswordChange): Promise<void> => {
    await api.put('/auth/password', data)
  },
}

export default authService
