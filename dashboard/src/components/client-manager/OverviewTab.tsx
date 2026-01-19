/**
 * Overview Tab Component
 * 
 * Client dashboard overview with key metrics
 */
import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import { Client, Invoice, getBillingStatusColor } from './types'

interface OverviewTabProps {
  clients: Client[]
  invoices: Invoice[]
  selectedClient: Client | null
  onSelectClient: (client: Client) => void
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  clients,
  invoices,
  selectedClient,
  onSelectClient
}) => {
  const totalRevenue = clients.reduce((sum, c) => sum + c.total_revenue, 0)
  const activeClients = clients.filter(c => c.billing_status === 'active').length
  const pendingInvoices = invoices.filter(i => i.status === 'pending').length
  const overdueInvoices = invoices.filter(i => i.status === 'overdue').length

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-600">Total Clients</p>
            <p className="text-2xl font-bold">{clients.length}</p>
            <p className="text-xs text-green-600">{activeClients} active</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-600">Total Revenue</p>
            <p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-600">Pending Invoices</p>
            <p className="text-2xl font-bold text-yellow-600">{pendingInvoices}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <p className="text-sm text-gray-600">Overdue Invoices</p>
            <p className="text-2xl font-bold text-red-600">{overdueInvoices}</p>
          </div>
        </Card>
      </div>

      {/* Recent Clients */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Clients</h3>
          <div className="space-y-3">
            {clients.slice(0, 5).map(client => (
              <div
                key={client.id}
                className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                onClick={() => onSelectClient(client)}
              >
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-gray-500">{client.company}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600">
                    ${client.monthly_rate}/mo
                  </span>
                  <Badge className={getBillingStatusColor(client.billing_status)}>
                    {client.billing_status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default OverviewTab
