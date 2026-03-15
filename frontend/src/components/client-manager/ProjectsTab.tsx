/**
 * Projects Tab Component
 * 
 * Client projects listing
 */
import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import { Project, getProjectStatusColor } from './types'

interface ProjectsTabProps {
  projects: Project[]
}

const ProjectsTab: React.FC<ProjectsTabProps> = ({ projects }) => {
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Client Projects</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <div key={project.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{project.name}</h4>
                  <Badge className={getProjectStatusColor(project.status)}>
                    {project.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 mb-3">{project.domain}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Monthly Rate:</span>
                  <span className="font-medium">${project.monthly_rate}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Started:</span>
                  <span>{project.start_date.toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>

          {projects.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No projects found.
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default ProjectsTab
