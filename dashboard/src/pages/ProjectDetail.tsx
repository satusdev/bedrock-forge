import React from 'react'
import { useParams } from 'react-router-dom'
import ProjectDetailLayout from '@/components/ProjectDetailLayout'

const ProjectDetail: React.FC = () => {
  const { projectName } = useParams()

  if (!projectName) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Project not specified</h3>
        <p className="mt-2 text-gray-500">Please specify a project name in the URL.</p>
      </div>
    )
  }

  return <ProjectDetailLayout projectName={projectName} />
}

export default ProjectDetail