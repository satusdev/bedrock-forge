/**
 * Scheduler Tab Component
 * 
 * Scheduled operations management and configuration
 */
import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'

interface ScheduledOperation {
  title: string
  description: string
  status: 'active' | 'paused'
  nextRun: string
}

const SchedulerTab: React.FC = () => {
  const scheduledOps: ScheduledOperation[] = [
    {
      title: 'Daily Backups',
      description: 'All projects • Every day at 1:00 AM',
      status: 'active',
      nextRun: 'Tomorrow at 1:00 AM'
    },
    {
      title: 'Weekly Security Scan',
      description: 'Production projects • Sundays at 3:00 AM',
      status: 'active',
      nextRun: 'In 3 days at 3:00 AM'
    },
    {
      title: 'Monthly Updates',
      description: 'All projects • 1st of each month at 2:00 AM',
      status: 'active',
      nextRun: 'In 10 days at 2:00 AM'
    },
    {
      title: 'Cache Cleanup',
      description: 'High-traffic projects • Every 6 hours',
      status: 'paused',
      nextRun: 'Paused by admin on Sep 15, 2024'
    }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Scheduled Operations</h3>
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Schedule Operation
            </Button>
          </div>

          <div className="space-y-4">
            {scheduledOps.map((op, idx) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{op.title}</h4>
                    <p className="text-sm text-gray-600">{op.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={op.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {op.status === 'active' ? 'Active' : 'Paused'}
                    </Badge>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {op.status === 'active' ? `Next run: ${op.nextRun}` : op.nextRun}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Schedule Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Default Maintenance Window</label>
              <div className="flex space-x-2">
                <input
                  type="time"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  defaultValue="02:00"
                />
                <span className="flex items-center text-sm text-gray-500">to</span>
                <input
                  type="time"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  defaultValue="04:00"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Concurrent Operations</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                defaultValue="3"
                min="1"
                max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Failure Notification</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Immediately</option>
                <option>After 3 failures</option>
                <option>Daily summary</option>
                <option>Weekly summary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Retry Failed Operations</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Automatically (3 attempts)</option>
                <option>Manually only</option>
                <option>Never retry</option>
              </select>
            </div>
          </div>
          <div className="mt-6">
            <Button>Save Configuration</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default SchedulerTab
