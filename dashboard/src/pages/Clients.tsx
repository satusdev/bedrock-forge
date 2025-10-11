import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Search,
  Building,
  Mail,
  Phone,
  Globe,
  DollarSign,
  Calendar,
  Edit,
  Trash2,
  FolderKanban,
  CheckCircle,
  AlertTriangle,
  X,
  Clock,
  MapPin,
  CreditCard
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { dashboardApi } from '@/services/api'
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates'
import toast from 'react-hot-toast'

interface Client {
  id: string
  name: string
  email: string
  phone: string
  company: string
  website: string
  billing_info: {
    rate: number
    billing_cycle: string
    currency: string
    payment_method: string
    invoice_email: string
  }
  projects: Array<{ project_name: string }>
  project_count: number
  created_at: string
  updated_at: string
  active: boolean
  notes: string
}

const Clients: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'projects'>('created')

  const queryClient = useQueryClient()

  // Set up real-time updates
  const { isConnected } = useRealTimeUpdates({
    onWordPressUpdate: (projectName, data) => {
      // Refresh clients when client assignments change
      if (data.type?.includes('client')) {
        queryClient.invalidateQueries(['clients'])
      }
    }
  })

  // Fetch clients
  const { data: clientsData, isLoading, refetch } = useQuery({
    queryKey: ['clients'],
    queryFn: dashboardApi.getClients,
  })

  const clients = clientsData?.data?.clients || []

  // Fetch projects for assignments
  const { data: projectsData } = useQuery({
    queryKey: ['comprehensive-projects'],
    queryFn: dashboardApi.getComprehensiveProjects,
  })

  const projects = projectsData?.data || []

  // Create client mutation
  const createClientMutation = useMutation({
    mutationFn: dashboardApi.createClient,
    onSuccess: () => {
      toast.success('Client created successfully!')
      setShowCreateModal(false)
      refetch()
    },
    onError: (error: any) => {
      toast.error(`Failed to create client: ${error.response?.data?.detail || error.message}`)
    }
  })

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: ({ clientId, clientData }: { clientId: string, clientData: any }) =>
      dashboardApi.updateClient(clientId, clientData),
    onSuccess: () => {
      toast.success('Client updated successfully!')
      setShowEditModal(false)
      setSelectedClient(null)
      refetch()
    },
    onError: (error: any) => {
      toast.error(`Failed to update client: ${error.response?.data?.detail || error.message}`)
    }
  })

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: dashboardApi.deleteClient,
    onSuccess: () => {
      toast.success('Client deleted successfully!')
      setSelectedClient(null)
      refetch()
    },
    onError: (error: any) => {
      toast.error(`Failed to delete client: ${error.response?.data?.detail || error.message}`)
    }
  })

  // Filter and sort clients
  const filteredClients = clients
    .filter(client => {
      if (!searchQuery) return true
      const searchLower = searchQuery.toLowerCase()
      return (
        client.name.toLowerCase().includes(searchLower) ||
        client.email.toLowerCase().includes(searchLower) ||
        client.company.toLowerCase().includes(searchLower)
      )
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'projects':
          return b.project_count - a.project_count
        default:
          return 0
      }
    })

  const handleCreateClient = (clientData: any) => {
    createClientMutation.mutate(clientData)
  }

  const handleUpdateClient = (clientData: any) => {
    if (!selectedClient) return
    updateClientMutation.mutate({
      clientId: selectedClient.id,
      clientData
    })
  }

  const handleDeleteClient = (client: Client) => {
    if (window.confirm(`Are you sure you want to delete client "${client.name}"? This action cannot be undone.`)) {
      deleteClientMutation.mutate(client.id)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0
    }).format(amount)
  }

  const getStatusBadge = (active: boolean) => {
    return active
      ? { variant: 'success' as const, text: 'Active' }
      : { variant: 'default' as const, text: 'Inactive' }
  }

  const getBillingCycleText = (cycle: string) => {
    switch (cycle) {
      case 'monthly':
        return 'Monthly'
      case 'quarterly':
        return 'Quarterly'
      case 'yearly':
        return 'Yearly'
      default:
        return cycle
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="mt-1 text-sm text-gray-500">Manage client information and billing</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Connection Status */}
          <div className="flex items-center space-x-2 px-3 py-1 rounded-lg bg-gray-100">
            {isConnected ? (
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            ) : (
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            )}
            <span className="text-sm text-gray-700">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-100">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Clients</p>
              <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-100">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Clients</p>
              <p className="text-2xl font-bold text-gray-900">
                {clients.filter(c => c.active).length}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-100">
              <FolderKanban className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Projects</p>
              <p className="text-2xl font-bold text-gray-900">
                {clients.reduce((total, client) => total + client.project_count, 0)}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-yellow-100">
              <DollarSign className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg. Monthly Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {clients.length > 0
                  ? formatCurrency(
                      clients.reduce((total, client) => total + client.billing_info.rate, 0) / clients.length,
                      clients[0].billing_info.currency
                    )
                  : '$0'
                }
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'created' | 'projects')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="created">Sort by Created</option>
              <option value="name">Sort by Name</option>
              <option value="projects">Sort by Projects</option>
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Clients List */}
      <Card>
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-3 text-gray-500">Loading clients...</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Clients Found</h3>
            <p className="text-gray-500 mb-4">Add your first client to get started</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Client
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredClients.map((client) => {
              const statusBadge = getStatusBadge(client.active)
              return (
                <div
                  key={client.id}
                  className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-medium text-gray-900">{client.name}</h3>
                          <Badge variant={statusBadge.variant}>
                            {statusBadge.text}
                          </Badge>
                        </div>

                        <div className="flex items-center space-x-6 mt-2 text-sm text-gray-500">
                          {client.email && (
                            <span className="flex items-center">
                              <Mail className="w-4 h-4 mr-1" />
                              {client.email}
                            </span>
                          )}
                          {client.company && (
                            <span className="flex items-center">
                              <Building className="w-4 h-4 mr-1" />
                              {client.company}
                            </span>
                          )}
                          {client.phone && (
                            <span className="flex items-center">
                              <Phone className="w-4 h-4 mr-1" />
                              {client.phone}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-6 mt-3 text-sm">
                          <span className="flex items-center">
                            <FolderKanban className="w-4 h-4 mr-1" />
                            {client.project_count} projects
                          </span>
                          <span className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            Created {formatDate(client.created_at)}
                          </span>
                          <span className="flex items-center">
                            <DollarSign className="w-4 h-4 mr-1" />
                            {formatCurrency(client.billing_info.rate, client.billing_info.currency)}/{getBillingCycleText(client.billing_info.billing_cycle)}
                          </span>
                        </div>

                        {client.projects.length > 0 && (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-gray-700 mb-2">Projects:</p>
                            <div className="flex flex-wrap gap-2">
                              {client.projects.map((project) => (
                                <Badge key={project.project_name} variant="secondary" className="text-xs">
                                  {project.project_name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedClient(client)
                          setShowEditModal(true)
                        }}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClient(client)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Create Client Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Add New Client</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ClientForm
              onSubmit={handleCreateClient}
              onCancel={() => setShowCreateModal(false)}
              isLoading={createClientMutation.isLoading}
            />
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Edit Client</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEditModal(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <ClientForm
              initialData={selectedClient}
              onSubmit={handleUpdateClient}
              onCancel={() => setShowEditModal(false)}
              isLoading={updateClientMutation.isLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Client Form Component
interface ClientFormProps {
  initialData?: Client
  onSubmit: (data: any) => void
  onCancel: () => void
  isLoading?: boolean
}

const ClientForm: React.FC<ClientFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    company: initialData?.company || '',
    website: initialData?.website || '',
    billing_info: {
      rate: initialData?.billing_info?.rate || 0,
      billing_cycle: initialData?.billing_info?.billing_cycle || 'monthly',
      currency: initialData?.billing_info?.currency || 'USD',
      payment_method: initialData?.billing_info?.payment_method || '',
      invoice_email: initialData?.billing_info?.invoice_email || ''
    },
    notes: initialData?.notes || '',
    ...initialData
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target

    if (name.startsWith('billing_info.')) {
      const billingField = name.replace('billing_info.', '')
      setFormData(prev => ({
        ...prev,
        billing_info: {
          ...prev.billing_info,
          [billingField]: value
        }
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email *
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company
          </label>
          <input
            type="text"
            name="company"
            value={formData.company}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Website
          </label>
          <input
            type="url"
            name="website"
            value={formData.website}
            onChange={handleChange}
            placeholder="https://"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-md font-medium text-gray-900 mb-4">Billing Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rate
            </label>
            <input
              type="number"
              name="billing_info.rate"
              value={formData.billing_info.rate}
              onChange={handleChange}
              min="0"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Billing Cycle
            </label>
            <select
              name="billing_info.billing_cycle"
              value={formData.billing_info.billing_cycle}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              name="billing_info.currency"
              value={formData.billing_info.currency}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Method
            </label>
            <input
              type="text"
              name="billing_info.payment_method"
              value={formData.billing_info.payment_method}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Email
            </label>
            <input
              type="email"
              name="billing_info.invoice_email"
              value={formData.billing_info.invoice_email}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isLoading}
          className="min-w-[100px]"
        >
          {isLoading ? 'Saving...' : initialData ? 'Update Client' : 'Create Client'}
        </Button>
      </div>
    </form>
  )
}

export default Clients

export default Clients