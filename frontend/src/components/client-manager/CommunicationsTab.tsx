/**
 * Communications Tab Component
 * 
 * Client communication history and messaging
 */
import React from 'react'
import Card from '../ui/Card'
import Button from '../ui/Button'

interface CommunicationsTabProps {
  clientId?: string
}

const CommunicationsTab: React.FC<CommunicationsTabProps> = ({ clientId }) => {
  const communications = [
    {
      id: '1',
      type: 'email',
      subject: 'Invoice #INV-001 Payment Received',
      date: new Date('2024-09-20'),
      preview: 'Thank you for your payment. Your invoice has been marked as paid.'
    },
    {
      id: '2',
      type: 'email',
      subject: 'Monthly Site Report - September 2024',
      date: new Date('2024-09-01'),
      preview: 'Here is your monthly site performance report for September...'
    },
    {
      id: '3',
      type: 'note',
      subject: 'Client Call Notes',
      date: new Date('2024-08-15'),
      preview: 'Discussed upcoming redesign project. Client wants to launch by Q4...'
    }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Communications</h3>
            <div className="flex space-x-2">
              <Button variant="outline">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Send Email
              </Button>
              <Button variant="outline">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Add Note
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {communications.map(comm => (
              <div key={comm.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {comm.type === 'email' ? (
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    )}
                    <span className="font-medium">{comm.subject}</span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {comm.date.toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-gray-600 ml-7">{comm.preview}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default CommunicationsTab
