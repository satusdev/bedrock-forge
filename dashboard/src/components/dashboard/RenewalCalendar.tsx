import React, { useState, useEffect } from 'react'
import Card from '../ui/Card'
import { Calendar as CalendarIcon, Clock, AlertTriangle } from 'lucide-react'
import { billingService } from '../../services/billing'

interface RenewalEvent {
  id: number
  title: string
  date: string
  type: 'domain' | 'ssl' | 'subscription'
  amount?: number
  days_until: number
}

const RenewalCalendar: React.FC = () => {
  const [events, setEvents] = useState<RenewalEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRenewals = async () => {
      try {
        // When billing API is integrated, fetch real data here
        // For now, show empty state
        setEvents([])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    fetchRenewals()
  }, [])

  if (loading) return <Card><div className="p-4 text-center">Loading calendar...</div></Card>

  return (
    <Card title="Upcoming Renewals">
      <div className="divide-y divide-gray-100">
        {events.map((event) => (
          <div key={`${event.type}-${event.id}`} className="p-4 hover:bg-gray-50 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${event.days_until <= 7 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {event.days_until <= 7 ? <AlertTriangle className="w-5 h-5" /> : <CalendarIcon className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{event.title}</p>
                <div className="flex items-center text-xs text-gray-500 mt-0.5">
                   <Clock className="w-3 h-3 mr-1" />
                   {event.date} ({event.days_until} days)
                </div>
              </div>
            </div>
            {event.amount && (
               <div className="text-sm font-medium text-gray-900">
                 ${event.amount.toFixed(2)}
               </div>
            )}
          </div>
        ))}
        {events.length === 0 && (
          <div className="p-4 text-center text-gray-500">No upcoming renewals</div>
        )}
      </div>
       <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">View All Renewals</button>
      </div>
    </Card>
  )
}

export default RenewalCalendar
