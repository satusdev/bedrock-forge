/**
 * Clients Tab Component
 * 
 * Client list with search and filtering
 */
import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { Client, getBillingStatusColor } from './types'

interface ClientsTabProps {
  clients: Client[]
  searchQuery: string
  onSearchChange: (query: string) => void
  onSelectClient: (client: Client) => void
  onAddClient: () => void
}

const ClientsTab: React.FC<ClientsTabProps> = ({
  clients,
  searchQuery,
  onSearchChange,
  onSelectClient,
  onAddClient
}) => {
  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">All Clients</h3>
            <div className="flex items-center space-x-4">
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button onClick={onAddClient}>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Client
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Client</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Company</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Monthly Rate</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(client => (
                  <tr
                    key={client.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => onSelectClient(client)}
                  >
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-gray-500">{client.phone}</p>
                      </div>
                    </td>
                    <td className="py-3 px-4">{client.company}</td>
                    <td className="py-3 px-4">{client.email}</td>
                    <td className="py-3 px-4">${client.monthly_rate}</td>
                    <td className="py-3 px-4">
                      <Badge className={getBillingStatusColor(client.billing_status)}>
                        {client.billing_status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="outline" size="sm">View</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredClients.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No clients found matching your search.
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

export default ClientsTab
