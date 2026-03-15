/**
 * Templates Tab Component
 * 
 * Displays and manages operation templates
 */
import React from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'

const CheckIcon = () => (
  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

interface TemplateCardProps {
  title: string
  schedule: string
  operations: string[]
  lastRun: string
}

const TemplateCard: React.FC<TemplateCardProps> = ({ title, schedule, operations, lastRun }) => (
  <div className="border rounded-lg p-4">
    <h4 className="font-medium text-gray-900 mb-2">{title}</h4>
    <p className="text-sm text-gray-600 mb-4">{schedule}</p>
    <div className="space-y-2 mb-4">
      {operations.map((op, idx) => (
        <div key={idx} className="flex items-center text-sm text-gray-600">
          <CheckIcon />
          {op}
        </div>
      ))}
    </div>
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-500">{lastRun}</span>
      <Button variant="outline" size="sm">Edit</Button>
    </div>
  </div>
)

const TemplatesTab: React.FC = () => {
  const templates = [
    {
      title: 'Weekly Maintenance',
      schedule: 'Runs every Sunday at 2:00 AM',
      operations: ['Clear all caches', 'Cleanup spam comments', 'Optimize databases'],
      lastRun: 'Last run: 2 days ago'
    },
    {
      title: 'Monthly Security',
      schedule: 'Runs on the 1st of each month',
      operations: ['Security scan', 'Check SSL certificates', 'Update WordPress core'],
      lastRun: 'Last run: 15 days ago'
    },
    {
      title: 'Daily Backup',
      schedule: 'Runs every day at 1:00 AM',
      operations: ['Complete backup', 'Upload to Google Drive', 'Cleanup old backups'],
      lastRun: 'Last run: 5 hours ago'
    },
    {
      title: 'Performance Optimization',
      schedule: 'Runs weekly on Fridays',
      operations: ['Compress images', 'Cleanup revisions', 'Clear caches'],
      lastRun: 'Last run: 1 week ago'
    }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Operation Templates</h3>
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Template
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map((template, idx) => (
              <TemplateCard key={idx} {...template} />
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default TemplatesTab
