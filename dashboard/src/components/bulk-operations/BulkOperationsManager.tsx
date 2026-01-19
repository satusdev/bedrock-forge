/**
 * Bulk Operations Manager
 * 
 * Main container component that orchestrates bulk operations across projects.
 * Extracted tab components for better maintainability.
 */
import React, { useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { Project, BulkOperation, OperationTask } from './types'
import OperationsTab from './OperationsTab'
import QueueTab from './QueueTab'
import HistoryTab from './HistoryTab'
import TemplatesTab from './TemplatesTab'
import SchedulerTab from './SchedulerTab'

interface BulkOperationsManagerProps {
  projectId: string
}

// Data will come from API in future implementation

type TabType = 'operations' | 'queue' | 'history' | 'templates' | 'scheduler'

const BulkOperationsManager: React.FC<BulkOperationsManagerProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('operations')
  const [selectedProjects, setSelectedProjects] = useState<string[]>([])
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [operationName, setOperationName] = useState('')
  const [currentOperation, setCurrentOperation] = useState<string | null>(null)
  
  const [projects] = useState<Project[]>([])
  const [bulkOperations] = useState<BulkOperation[]>([])
  const [operationQueue, setOperationQueue] = useState<OperationTask[]>([])

  const handleProjectSelect = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    )
  }

  const handleSelectAll = () => {
    if (selectedProjects.length === projects.length) {
      setSelectedProjects([])
    } else {
      setSelectedProjects(projects.map(p => p.id))
    }
  }

  const handleStartOperation = (operationId: string) => {
    if (selectedProjects.length === 0) return

    const operation = bulkOperations.find(op => op.id === operationId)
    if (operation?.requires_confirmation) {
      setCurrentOperation(operationId)
      setOperationName(operation.name)
      setShowConfirmation(true)
    } else {
      startOperation(operationId)
    }
  }

  const startOperation = (operationId: string) => {
    const newTasks = selectedProjects.map(projectId => ({
      id: `task_${Date.now()}_${projectId}`,
      operation_id: operationId,
      project_id: projectId,
      status: 'pending' as const,
      progress: 0
    }))

    setOperationQueue(prev => [...prev, ...newTasks])
    setShowConfirmation(false)
    setCurrentOperation(null)
    setOperationName('')
  }

  const handleCancelTask = (taskId: string) => {
    setOperationQueue(prev =>
      prev.map(t =>
        t.id === taskId ? { ...t, status: 'cancelled' as const } : t
      )
    )
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'operations', label: 'Operations' },
    { id: 'queue', label: 'Queue' },
    { id: 'history', label: 'History' },
    { id: 'templates', label: 'Templates' },
    { id: 'scheduler', label: 'Scheduler' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bulk Operations Manager</h2>
          <p className="text-gray-600">Execute and manage operations across multiple projects</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {tab.id === 'queue' && operationQueue.filter(t => t.status === 'pending' || t.status === 'running').length > 0 && (
                <Badge className="ml-2 bg-indigo-100 text-indigo-800">
                  {operationQueue.filter(t => t.status === 'pending' || t.status === 'running').length}
                </Badge>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'operations' && (
        <OperationsTab
          projects={projects}
          selectedProjects={selectedProjects}
          bulkOperations={bulkOperations}
          onProjectSelect={handleProjectSelect}
          onSelectAll={handleSelectAll}
          onStartOperation={handleStartOperation}
        />
      )}
      {activeTab === 'queue' && (
        <QueueTab
          operationQueue={operationQueue}
          projects={projects}
          bulkOperations={bulkOperations}
          onCancelTask={handleCancelTask}
        />
      )}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'scheduler' && <SchedulerTab />}

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirm Operation</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to run "{operationName}" on {selectedProjects.length} project(s)?
            </p>
            <div className="flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                Cancel
              </Button>
              <Button onClick={() => currentOperation && startOperation(currentOperation)}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BulkOperationsManager
