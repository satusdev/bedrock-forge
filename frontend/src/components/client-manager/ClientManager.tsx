/**
 * Client Manager
 * 
 * Main container component for client relationship management.
 * Extracted tab components for better maintainability.
 */
import React, { useState } from 'react'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { Client, Invoice, Project } from './types'
import OverviewTab from './OverviewTab'
import ClientsTab from './ClientsTab'
import BillingTab from './BillingTab'
import ProjectsTab from './ProjectsTab'
import CommunicationsTab from './CommunicationsTab'

interface ClientManagerProps {
  projectId: string
}

// Data will come from API in future implementation

type TabType = 'overview' | 'clients' | 'billing' | 'projects' | 'communications'

const ClientManager: React.FC<ClientManagerProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  
  const [clients] = useState<Client[]>([])
  const [invoices] = useState<Invoice[]>([])
  const [projects] = useState<Project[]>([])

  const tabs: { id: TabType; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'clients', label: 'Clients' },
    { id: 'billing', label: 'Billing' },
    { id: 'projects', label: 'Projects' },
    { id: 'communications', label: 'Communications' }
  ]

  const handleAddClient = () => {
    console.log('Add client modal')
  }

  const handleCreateInvoice = () => {
    console.log('Create invoice modal')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Client Manager</h2>
          <p className="text-gray-600">Manage clients, billing, and communications</p>
        </div>
        <Button onClick={handleAddClient}>
          Add Client
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          clients={clients}
          invoices={invoices}
          selectedClient={selectedClient}
          onSelectClient={setSelectedClient}
        />
      )}
      {activeTab === 'clients' && (
        <ClientsTab
          clients={clients}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelectClient={setSelectedClient}
          onAddClient={handleAddClient}
        />
      )}
      {activeTab === 'billing' && (
        <BillingTab
          invoices={invoices}
          clients={clients}
          onCreateInvoice={handleCreateInvoice}
        />
      )}
      {activeTab === 'projects' && (
        <ProjectsTab projects={projects} />
      )}
      {activeTab === 'communications' && (
        <CommunicationsTab clientId={selectedClient?.id} />
      )}
    </div>
  )
}

export default ClientManager
