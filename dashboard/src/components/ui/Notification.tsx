import React from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface NotificationProps {
  type: NotificationType
  message: string
  description?: string
  onClose?: () => void
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  description,
  onClose,
  duration,
  action
}) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />
    }
  }

  const getBackgroundClass = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
    }
  }

  const getTextClass = () => {
    switch (type) {
      case 'success':
        return 'text-green-800'
      case 'error':
        return 'text-red-800'
      case 'warning':
        return 'text-yellow-800'
      case 'info':
        return 'text-blue-800'
    }
  }

  return (
    <div className={`flex items-start p-4 rounded-lg border ${getBackgroundClass()} shadow-sm`}>
      <div className="flex-shrink-0">
        {getIcon()}
      </div>

      <div className="ml-3 flex-1">
        <p className={`text-sm font-medium ${getTextClass()}`}>
          {message}
        </p>

        {description && (
          <p className={`text-sm ${getTextClass()} opacity-75 mt-1`}>
            {description}
          </p>
        )}

        {action && (
          <div className="mt-3">
            <button
              onClick={action.onClick}
              className={`text-sm font-medium ${getTextClass()} underline hover:no-underline focus:outline-none focus:underline`}
            >
              {action.label}
            </button>
          </div>
        )}
      </div>

      {onClose && (
        <div className="ml-4 flex-shrink-0">
          <button
            onClick={onClose}
            className={`inline-flex text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 transition-colors`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default Notification