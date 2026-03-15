/**
 * Operations Tab Component
 * 
 * Project selection and available operations display
 */
import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { Project, BulkOperation, getStatusColor, getSSLStatusColor, getImpactLevelColor } from './types'

interface OperationsTabProps {
  projects: Project[]
  selectedProjects: string[]
  bulkOperations: BulkOperation[]
  onProjectSelect: (projectId: string) => void
  onSelectAll: () => void
  onStartOperation: (operationId: string) => void
}

const OperationsTab: React.FC<OperationsTabProps> = ({
  projects,
  selectedProjects,
  bulkOperations,
  onProjectSelect,
  onSelectAll,
  onStartOperation
}) => {
  const statusColorClass = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800'
      case 'development': return 'bg-blue-100 text-blue-800'
      case 'maintenance': return 'bg-yellow-100 text-yellow-800'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const sslColorClass = (status: Project['ssl_status']) => {
    switch (status) {
      case 'valid': return 'bg-green-100 text-green-800'
      case 'expiring': return 'bg-yellow-100 text-yellow-800'
      case 'expired': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const impactColorClass = (level: BulkOperation['impact_level']) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800'
      case 'medium': return 'bg-yellow-100 text-yellow-800'
      case 'high': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Project Selection */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Select Projects</h3>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {selectedProjects.length} of {projects.length} selected
              </span>
              <Button variant="outline" size="sm" onClick={onSelectAll}>
                {selectedProjects.length === projects.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedProjects.includes(project.id)
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => onProjectSelect(project.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedProjects.includes(project.id)}
                      onChange={() => onProjectSelect(project.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <h4 className="font-medium text-gray-900">{project.name}</h4>
                      <p className="text-sm text-gray-500">{project.domain}</p>
                    </div>
                  </div>
                  <Badge className={statusColorClass(project.status)}>
                    {project.status}
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Client:</span>
                    <span>{project.client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Server:</span>
                    <span>{project.server}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>WordPress:</span>
                    <span>{project.wp_version}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>SSL:</span>
                    <Badge className={sslColorClass(project.ssl_status)}>
                      {project.ssl_status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Available Operations */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Available Operations</h3>

          <div className="space-y-6">
            {['maintenance', 'security', 'updates', 'performance', 'backups'].map((category) => {
              const categoryOperations = bulkOperations.filter(op => op.category === category)
              if (categoryOperations.length === 0) return null

              return (
                <div key={category}>
                  <h4 className="font-medium text-gray-900 mb-3 capitalize">{category} Operations</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryOperations.map((operation) => (
                      <div key={operation.id} className="border rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                          <div className="text-2xl">{operation.icon}</div>
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{operation.name}</h5>
                            <p className="text-sm text-gray-600 mb-3">{operation.description}</p>

                            <div className="space-y-2 mb-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Impact:</span>
                                <Badge className={impactColorClass(operation.impact_level)}>
                                  {operation.impact_level}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Time:</span>
                                <span className="text-gray-700">{operation.estimated_time}</span>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full"
                              disabled={selectedProjects.length === 0}
                              onClick={() => onStartOperation(operation.id)}
                            >
                              {operation.requires_confirmation ? 'Configure & Run' : 'Run Now'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default OperationsTab
