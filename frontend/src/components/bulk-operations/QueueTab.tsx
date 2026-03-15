/**
 * Queue Tab Component
 * 
 * Displays running, pending, completed, and failed tasks
 */
import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { Project, BulkOperation, OperationTask } from './types'

interface QueueTabProps {
  operationQueue: OperationTask[]
  projects: Project[]
  bulkOperations: BulkOperation[]
  onCancelTask: (taskId: string) => void
}

const QueueTab: React.FC<QueueTabProps> = ({
  operationQueue,
  projects,
  bulkOperations,
  onCancelTask
}) => {
  const runningTasks = operationQueue.filter(t => t.status === 'running')
  const pendingTasks = operationQueue.filter(t => t.status === 'pending')
  const completedTasks = operationQueue.filter(t => t.status === 'completed')
  const failedTasks = operationQueue.filter(t => t.status === 'failed')

  const getTaskStatusColor = (status: OperationTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'running': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Queue Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Running</p>
              <p className="text-2xl font-bold text-blue-600">{runningTasks.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingTasks.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{completedTasks.length}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Failed</p>
              <p className="text-2xl font-bold text-red-600">{failedTasks.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Tasks */}
      {(runningTasks.length > 0 || pendingTasks.length > 0) && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Active Tasks</h3>
            <div className="space-y-4">
              {[...runningTasks, ...pendingTasks].map((task) => {
                const operation = bulkOperations.find(op => op.id === task.operation_id)
                const project = projects.find(p => p.id === task.project_id)

                return (
                  <div key={task.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium text-gray-900">{operation?.name}</h4>
                        <p className="text-sm text-gray-600">{project?.name} - {project?.domain}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge className={getTaskStatusColor(task.status)}>
                          {task.status}
                        </Badge>
                        {task.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onCancelTask(task.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>

                    {task.status === 'running' && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Progress</span>
                          <span className="text-gray-900">{task.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        {task.started_at && (
                          <p className="text-xs text-gray-500">
                            Started: {task.started_at.toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    )}

                    {task.status === 'failed' && task.error_message && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-sm text-red-800">{task.error_message}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">Completed Tasks</h3>
            <div className="space-y-3">
              {completedTasks.map((task) => {
                const operation = bulkOperations.find(op => op.id === task.operation_id)
                const project = projects.find(p => p.id === task.project_id)

                return (
                  <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{operation?.name}</p>
                      <p className="text-sm text-gray-600">{project?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-green-600">Completed</p>
                      {task.completed_at && (
                        <p className="text-xs text-gray-500">
                          {task.completed_at.toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

export default QueueTab
