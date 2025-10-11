/**
 * Custom hook for handling API errors and loading states.
 */

import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'

interface ApiErrorState {
  error: Error | null
  isLoading: boolean
  hasError: boolean
}

interface UseApiErrorReturn extends ApiErrorState {
  setError: (error: Error | null) => void
  setLoading: (loading: boolean) => void
  clearError: () => void
  retry: () => void
  handleError: (error: any, customMessage?: string) => void
}

export const useApiError = (initialLoading: boolean = false): UseApiErrorReturn => {
  const [state, setState] = useState<ApiErrorState>({
    error: null,
    isLoading: initialLoading,
    hasError: false
  })

  const setError = useCallback((error: Error | null) => {
    setState(prev => ({
      ...prev,
      error,
      hasError: !!error,
      isLoading: false
    }))
  }, [])

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      isLoading: loading,
      hasError: false,
      error: null
    }))
  }, [])

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
      hasError: false
    }))
  }, [])

  const retry = useCallback(() => {
    clearError()
    // This will be used by components to retry the failed operation
  }, [clearError])

  const handleError = useCallback((error: any, customMessage?: string) => {
    console.error('API Error:', error)

    let errorMessage = customMessage || 'An unexpected error occurred'

    if (error?.response?.data?.detail) {
      errorMessage = error.response.data.detail
    } else if (error?.message) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    }

    const enhancedError = new Error(errorMessage)
    enhancedError.stack = error?.stack

    setError(enhancedError)

    // Show toast only if no custom message provided (to avoid duplicate toasts)
    if (!customMessage) {
      const status = error?.response?.status

      if (status === 404) {
        toast.warning(errorMessage)
      } else if (status && status >= 500) {
        toast.error('Server error. Please try again later.')
      } else {
        toast.error(errorMessage)
      }
    }
  }, [setError])

  return {
    ...state,
    setError,
    setLoading,
    clearError,
    retry,
    handleError
  }
}

export default useApiError