/**
 * History Tab Component
 * 
 * Displays operation execution history
 */
import React from 'react'
import Card from '../ui/Card'

const HistoryTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Operation History</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Security Scan Completed</p>
                  <p className="text-sm text-gray-600">6 projects scanned successfully</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">2 hours ago</p>
                <p className="text-xs text-gray-500">Duration: 8m 34s</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">All Plugins Updated</p>
                  <p className="text-sm text-gray-600">45 plugins updated across 4 projects</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">Yesterday</p>
                <p className="text-xs text-gray-500">Duration: 23m 12s</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Complete Backup Created</p>
                  <p className="text-sm text-gray-600">Full backups for all 6 projects</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">2 days ago</p>
                <p className="text-xs text-gray-500">Duration: 45m 18s</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-red-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">WordPress Core Update Failed</p>
                  <p className="text-sm text-gray-600">Failed on 1 project due to compatibility</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">3 days ago</p>
                <p className="text-xs text-gray-500">Duration: 6m 42s</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default HistoryTab
