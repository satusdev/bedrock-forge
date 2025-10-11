/**
 * React hook for real-time WebSocket updates.
 */

import { useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import websocketService, { WebSocketMessage } from '@/services/websocket'

interface UseRealTimeUpdatesOptions {
  enabled?: boolean
  onProjectUpdate?: (projectName: string, data: any) => void
  onDdevStatusChange?: (projectName: string, status: string, message: string) => void
  onWordPressUpdate?: (projectName: string, data: any) => void
  onConnectionChange?: (connected: boolean) => void
}

export const useRealTimeUpdates = (options: UseRealTimeUpdatesOptions = {}) => {
  const {
    enabled = true,
    onProjectUpdate,
    onDdevStatusChange,
    onWordPressUpdate,
    onConnectionChange
  } = options

  const queryClient = useQueryClient()
  const connectionTimeoutRef = useRef<NodeJS.Timeout>()

  const handleConnectionChange = useCallback((connected: boolean) => {
    onConnectionChange?.(connected)

    if (connected) {
      toast.success('Real-time updates connected')
    } else {
      toast.error('Real-time updates disconnected')
    }
  }, [onConnectionChange])

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'connection':
        handleConnectionChange(message.status === 'connected')
        break

      case 'project_update':
        if (message.project_name && message.data) {
          const updateType = message.data.type
          const updateData = message.data.data

          // Update cache for specific project
          queryClient.invalidateQueries(['project', message.project_name])
          queryClient.invalidateQueries(['comprehensive-projects'])
          queryClient.invalidateQueries(['dashboard-stats'])

          // Call specific handlers
          onProjectUpdate?.(message.project_name, updateData)

          switch (updateType) {
            case 'ddev_status_changed':
              onDdevStatusChange?.(
                message.project_name,
                updateData.status,
                updateData.message
              )
              toast.success(`${message.project_name}: ${updateData.message}`)
              break

            case 'wordpress_plugin_updated':
            case 'wordpress_theme_updated':
            case 'wordpress_core_updated':
              onWordPressUpdate?.(message.project_name, updateData)
              toast.success(`${message.project_name}: ${updateData.message}`)
              break

            case 'backup_created':
            case 'backup_restored':
              toast.success(`${message.project_name}: ${updateData.message}`)
              break

            default:
              console.log('Unhandled project update type:', updateType)
          }
        }
        break

      case 'subscription_confirmed':
        console.log(`Subscribed to project updates for: ${message.project_name}`)
        break

      case 'unsubscription_confirmed':
        console.log(`Unsubscribed from project updates for: ${message.project_name}`)
        break

      case 'pong':
        // Handle pong response (keep-alive)
        break

      default:
        console.log('Unhandled WebSocket message type:', message.type)
    }
  }, [queryClient, onProjectUpdate, onDdevStatusChange, onWordPressUpdate, handleConnectionChange])

  const connect = useCallback(async () => {
    if (!enabled) return

    try {
      await websocketService.connect()

      // Set up event handlers
      websocketService.on('message', handleMessage)

      // Send initial ping
      websocketService.ping()

      // Set up periodic ping to keep connection alive
      connectionTimeoutRef.current = setInterval(() => {
        if (websocketService.isConnected()) {
          websocketService.ping()
        }
      }, 30000) // Ping every 30 seconds

    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      handleConnectionChange(false)
    }
  }, [enabled, handleMessage, handleConnectionChange])

  const disconnect = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearInterval(connectionTimeoutRef.current)
    }

    websocketService.off('message', handleMessage)
    websocketService.disconnect()
    handleConnectionChange(false)
  }, [handleMessage, handleConnectionChange])

  const subscribeToProject = useCallback((projectName: string) => {
    if (websocketService.isConnected()) {
      websocketService.subscribeToProject(projectName)
    }
  }, [])

  const unsubscribeFromProject = useCallback((projectName: string) => {
    if (websocketService.isConnected()) {
      websocketService.unsubscribeFromProject(projectName)
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  return {
    isConnected: websocketService.isConnected(),
    clientId: websocketService.getClientId(),
    connect,
    disconnect,
    subscribeToProject,
    unsubscribeFromProject
  }
}