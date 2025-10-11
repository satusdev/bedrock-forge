/**
 * WebSocket service for real-time dashboard updates.
 */

type WebSocketMessage = {
  type: string
  project_name?: string
  data?: any
  timestamp?: string
  status?: string
  message?: string
}

type WebSocketEventHandler = (data: any) => void

class WebSocketService {
  private ws: WebSocket | null = null
  private clientId: string
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnecting = false
  private eventHandlers: Map<string, WebSocketEventHandler[]> = new Map()

  constructor() {
    this.clientId = this.generateClientId()
    this.url = this.getWebSocketUrl()
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = '8001'  // Backend port
    return `${protocol}//${host}:${port}/api/v1/dashboard/ws/${this.clientId}`
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'))
        return
      }

      this.isConnecting = true

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnecting = false
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        this.ws.onclose = (event) => {
          console.log('WebSocket disconnected:', event.code, event.reason)
          this.isConnecting = false
          this.ws = null

          // Attempt to reconnect if not explicitly closed
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
              this.reconnectAttempts++
              console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
              this.connect().catch(console.error)
            }, this.reconnectDelay * this.reconnectAttempts)
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.isConnecting = false
          reject(error)
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  private handleMessage(message: WebSocketMessage) {
    console.log('WebSocket message received:', message)

    // Call specific event handlers
    const handlers = this.eventHandlers.get(message.type) || []
    handlers.forEach(handler => {
      try {
        handler(message)
      } catch (error) {
        console.error(`Error in WebSocket handler for type ${message.type}:`, error)
      }
    })

    // Call general message handlers
    const generalHandlers = this.eventHandlers.get('message') || []
    generalHandlers.forEach(handler => {
      try {
        handler(message)
      } catch (error) {
        console.error('Error in general WebSocket handler:', error)
      }
    })
  }

  on(eventType: string, handler: WebSocketEventHandler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  off(eventType: string, handler: WebSocketEventHandler) {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  send(message: WebSocketMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }

  subscribeToProject(projectName: string) {
    this.send({
      type: 'subscribe_project',
      project_name: projectName
    })
  }

  unsubscribeFromProject(projectName: string) {
    this.send({
      type: 'unsubscribe_project',
      project_name: projectName
    })
  }

  ping() {
    this.send({ type: 'ping' })
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  getClientId(): string {
    return this.clientId
  }
}

// Create singleton instance
const websocketService = new WebSocketService()

export default websocketService
export type { WebSocketMessage, WebSocketEventHandler }