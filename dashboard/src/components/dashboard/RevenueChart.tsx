import React from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '../ui/Card'
import { TrendingUp } from 'lucide-react'

// Data will come from API in future implementation
const data: { name: string; revenue: number }[] = []

const RevenueChart: React.FC = () => {
  const hasData = data.length > 0

  return (
    <Card title="Revenue Overview">
      <div className="w-full p-4" style={{ minHeight: '320px' }}>
        {hasData ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={data}
              margin={{
                top: 10,
                right: 30,
                left: 0,
                bottom: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="#4F46E5" fill="#EEF2FF" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-72 text-gray-400">
            <TrendingUp className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm font-medium">No revenue data yet</p>
            <p className="text-xs mt-1">Revenue tracking will appear here</p>
          </div>
        )}
      </div>
    </Card>
  )
}

export default RevenueChart

