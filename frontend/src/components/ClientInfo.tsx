import React, { useState } from 'react'
import {
  Users,
  Mail,
  Phone,
  Building,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Edit,
  Plus,
  ExternalLink,
  Download,
  Upload,
  CreditCard,
  TrendingUp,
  Activity,
  MessageSquare,
  Award,
  Briefcase,
  BarChart,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
  UserCheck,
  Zap
} from 'lucide-react'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Button from './ui/Button'

interface ClientInfoProps {
  project: any
}

const ClientInfo: React.FC<ClientInfoProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState('overview')
  const [showEditClient, setShowEditClient] = useState(false)

  // Mock client data - in real implementation this would come from API
  const clientData = project.client || {
    name: 'Acme Corporation',
    email: 'contact@acme.com',
    phone: '+1 (555) 123-4567',
    company: 'Acme Corporation',
    billing_status: 'active',
    monthly_rate: 450.00,
    contract_start: new Date('2024-01-15'),
    contract_end: new Date('2025-01-15'),
    notes: 'Long-term client with multiple WordPress sites. Very responsive and pays on time.',
    contact_person: 'John Smith',
    address: '123 Business Ave, Suite 100, New York, NY 10001',
    website: 'https://acme.com',
    industry: 'Technology',
    client_since: new Date('2023-06-01')
  }

  // Mock projects for this client
  const clientProjects = [
    {
      project_name: 'acme-main',
      status: 'active',
      health_score: 95,
      monthly_rate: 250.00,
      last_invoice: new Date('2024-10-01'),
      next_invoice: new Date('2024-11-01')
    },
    {
      project_name: 'acme-blog',
      status: 'active',
      health_score: 88,
      monthly_rate: 100.00,
      last_invoice: new Date('2024-10-01'),
      next_invoice: new Date('2024-11-01')
    },
    {
      project_name: 'acme-store',
      status: 'maintenance',
      health_score: 75,
      monthly_rate: 100.00,
      last_invoice: new Date('2024-10-01'),
      next_invoice: new Date('2024-11-01')
    }
  ]

  // Mock communication history
  const communicationHistory = [
    {
      date: new Date('2024-10-06'),
      type: 'email',
      subject: 'Monthly Report',
      direction: 'sent',
      status: 'delivered'
    },
    {
      date: new Date('2024-10-03'),
      type: 'phone',
      subject: 'Site Performance Discussion',
      direction: 'received',
      status: 'completed'
    },
    {
      date: new Date('2024-09-28'),
      type: 'meeting',
      subject: 'Q4 Planning Meeting',
      direction: 'both',
      status: 'completed'
    }
  ]

  // Mock invoices
  const invoices = [
    {
      id: 'INV-2024-10-001',
      date: new Date('2024-10-01'),
      amount: 450.00,
      status: 'paid',
      due_date: new Date('2024-10-15'),
      projects: ['acme-main', 'acme-blog', 'acme-store']
    },
    {
      id: 'INV-2024-09-001',
      date: new Date('2024-09-01'),
      amount: 450.00,
      status: 'paid',
      due_date: new Date('2024-09-15'),
      projects: ['acme-main', 'acme-blog', 'acme-store']
    }
  ]

  const getBillingStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100'
      case 'overdue': return 'text-red-600 bg-red-100'
      case 'cancelled': return 'text-gray-600 bg-gray-100'
      case 'trial': return 'text-blue-600 bg-blue-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getContractStatus = () => {
    const now = new Date()
    const daysUntilEnd = Math.ceil((clientData.contract_end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilEnd < 0) return { status: 'expired', color: 'text-red-600 bg-red-100', text: 'Expired' }
    if (daysUntilEnd <= 30) return { status: 'expiring_soon', color: 'text-yellow-600 bg-yellow-100', text: `${daysUntilEnd} days left` }
    return { status: 'active', color: 'text-green-600 bg-green-100', text: `Active` }
  }

  const getRevenueMetrics = () => {
    const totalRevenue = clientProjects.reduce((sum, project) => sum + project.monthly_rate, 0)
    const totalExpenses = 50.00 // Mock expenses
    const profit = totalRevenue - totalExpenses
    const margin = ((profit / totalRevenue) * 100).toFixed(1)

    return { totalRevenue, totalExpenses, profit, margin }
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Users },
    { id: 'billing', name: 'Billing & Invoices', icon: DollarSign },
    { id: 'projects', name: 'Projects', icon: Briefcase },
    { id: 'communication', name: 'Communication', icon: MessageSquare },
    { id: 'documents', name: 'Documents', icon: FileText }
  ]

  const billingStatusColor = getBillingStatusColor(clientData.billing_status)
  const contractStatus = getContractStatus()
  const revenueMetrics = getRevenueMetrics()

  return (
    <div className="p-6 space-y-6">
      {/* Client Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">{clientData.name}</h3>
              <p className="text-sm text-gray-500">{clientData.company} • {clientData.industry}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-lg font-medium text-gray-900">${clientData.monthly_rate}/month</p>
              <p className="text-xs text-gray-500">Monthly Rate</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm" onClick={() => setShowEditClient(!showEditClient)}>
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Button variant="primary" size="sm">
                <ExternalLink className="w-4 h-4 mr-1" />
                Client Portal
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <nav className="flex space-x-8 px-6 border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                  ${activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card title="Client Status">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Billing Status</span>
                      <Badge variant={clientData.billing_status === 'active' ? 'success' : 'warning'}>
                        {clientData.billing_status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Contract Status</span>
                      <Badge variant={contractStatus.status === 'active' ? 'success' : 'warning'}>
                        {contractStatus.text}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Client Since</span>
                      <span className="text-sm text-gray-900">{clientData.client_since.toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Revenue Metrics">
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">${revenueMetrics.totalRevenue}</div>
                      <p className="text-sm text-gray-500">Monthly Revenue</p>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Profit</span>
                      <span className="text-green-600 font-medium">${revenueMetrics.profit}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Margin</span>
                      <span className="text-blue-600 font-medium">{revenueMetrics.margin}%</span>
                    </div>
                  </div>
                </Card>

                <Card title="Contact Information">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{clientData.email}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{clientData.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-600">{clientData.contact_person}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Quick Actions">
                  <div className="space-y-2">
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <FileText className="w-4 h-4 mr-2" />
                      Generate Invoice
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Send Report
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule Meeting
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Client Details">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Company Information</p>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Company</span>
                          <span className="text-gray-900">{clientData.company}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Industry</span>
                          <span className="text-gray-900">{clientData.industry}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Website</span>
                          <a href={clientData.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {clientData.website}
                          </a>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Address</span>
                          <span className="text-gray-900">{clientData.address}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-gray-900">Contract Information</p>
                      <div className="mt-2 space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Contract Period</span>
                          <span className="text-gray-900">
                            {clientData.contract_start.toLocaleDateString()} - {clientData.contract_end.toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Monthly Rate</span>
                          <span className="text-gray-900">${clientData.monthly_rate}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600">Billing Status</span>
                          <Badge variant={clientData.billing_status === 'active' ? 'success' : 'warning'}>
                            {clientData.billing_status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Notes">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      {clientData.notes}
                    </p>
                    <Button variant="secondary" size="sm" onClick={() => setShowEditClient(true)}>
                      <Edit className="w-4 h-4 mr-1" />
                      Edit Notes
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Billing & Invoices Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <Card title="Billing Overview">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900">${revenueMetrics.totalRevenue}</div>
                    <p className="text-sm text-gray-500">Monthly Revenue</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">${revenueMetrics.profit}</div>
                    <p className="text-sm text-gray-500">Monthly Profit</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">{revenueMetrics.margin}%</div>
                    <p className="text-sm text-gray-500">Profit Margin</p>
                  </div>
                </div>
              </Card>

              <Card title="Invoice History">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Recent invoices and payment status</p>
                    <Button variant="primary" size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Create Invoice
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {invoices.map((invoice, index) => (
                      <div key={invoice.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{invoice.id}</p>
                              <p className="text-xs text-gray-500">{invoice.date.toLocaleDateString()}</p>
                            </div>
                            <div className="text-sm text-gray-600">
                              Projects: {invoice.projects.join(', ')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">${invoice.amount}</p>
                            <p className="text-xs text-gray-500">Due {invoice.due_date.toLocaleDateString()}</p>
                          </div>
                          <Badge variant={invoice.status === 'paid' ? 'success' : 'warning'}>
                            {invoice.status}
                          </Badge>
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Revenue Analysis">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Revenue and profit analysis over time.</p>

                    {/* Revenue Chart Placeholder */}
                    <div className="h-48 bg-gray-50 rounded-lg flex items-center justify-center">
                      <div className="text-center text-gray-400">
                        <BarChart className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">Revenue chart would appear here</p>
                        <p className="text-xs">Monthly revenue trends and projections</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xl font-bold text-gray-900">${(revenueMetrics.totalRevenue * 12).toFixed(2)}</p>
                        <p className="text-xs text-gray-500">Annual Revenue</p>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <p className="text-xl font-bold text-gray-900">${(revenueMetrics.profit * 12).toFixed(2)}</p>
                        <p className="text-xs text-gray-500">Annual Profit</p>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Billing Settings">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Configure billing and payment settings.</p>
                    <div className="space-y-2">
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <CreditCard className="w-4 h-4 mr-2" />
                        Payment Methods
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <Clock className="w-4 h-4 mr-2" />
                        Invoice Schedule
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <FileText className="w-4 h-4 mr-2" />
                        Invoice Templates
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Projects Tab */}
          {activeTab === 'projects' && (
            <div className="space-y-6">
              <Card title="Client Projects">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">All projects associated with this client.</p>

                  <div className="space-y-3">
                    {clientProjects.map((project, index) => (
                      <div key={project.project_name} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{project.project_name}</p>
                              <p className="text-xs text-gray-500">Health Score: {project.health_score}%</p>
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <Badge variant={project.status === 'active' ? 'success' : 'warning'}>
                                {project.status}
                              </Badge>
                              <span>•</span>
                              <span>${project.monthly_rate}/month</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button variant="secondary" size="sm">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button variant="secondary" size="sm">
                            <BarChart className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card title="Project Statistics">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Projects</span>
                      <span className="font-medium">{clientProjects.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Active Projects</span>
                      <span className="font-medium text-green-600">
                        {clientProjects.filter(p => p.status === 'active').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Average Health</span>
                      <span className="font-medium">
                        {(clientProjects.reduce((sum, p) => sum + p.health_score, 0) / clientProjects.length).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Revenue</span>
                      <span className="font-medium">${revenueMetrics.totalRevenue}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Project Performance">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Best Performing</span>
                      <span className="font-medium text-green-600">
                        {clientProjects.reduce((best, current) =>
                          current.health_score > best.health_score ? current : best
                        ).project_name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Needs Attention</span>
                      <span className="font-medium text-yellow-600">
                        {clientProjects.reduce((worst, current) =>
                          current.health_score < worst.health_score ? current : worst
                        ).project_name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Highest Revenue</span>
                      <span className="font-medium text-blue-600">
                        ${Math.max(...clientProjects.map(p => p.monthly_rate))}/month
                      </span>
                    </div>
                  </div>
                </Card>

                <Card title="Quick Actions">
                  <div className="space-y-2">
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <BarChart className="w-4 h-4 mr-2" />
                      Performance Report
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <Activity className="w-4 h-4 mr-2" />
                      Health Check All
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <Zap className="w-4 h-4 mr-2" />
                      Optimize All
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Communication Tab */}
          {activeTab === 'communication' && (
            <div className="space-y-6">
              <Card title="Communication History">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Recent interactions with the client</p>
                    <Button variant="primary" size="sm">
                      <MessageSquare className="w-4 h-4 mr-1" />
                      New Message
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {communicationHistory.map((comm, index) => (
                      <div key={index} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
                        <div className={`p-2 rounded-full ${
                          comm.type === 'email' ? 'bg-blue-100' :
                          comm.type === 'phone' ? 'bg-green-100' :
                          'bg-gray-200'
                        }`}>
                          {
                            comm.type === 'email' ? <Mail className="w-4 h-4 text-blue-600" /> :
                            comm.type === 'phone' ? <Phone className="w-4 h-4 text-green-600" /> :
                            <MessageSquare className="w-4 h-4 text-gray-600" />
                          }
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{comm.subject}</p>
                              <p className="text-xs text-gray-500">
                                {comm.date.toLocaleDateString()} • {comm.direction === 'sent' ? 'Sent' : 'Received'} • {comm.status}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Badge variant={comm.status === 'delivered' || comm.status === 'completed' ? 'success' : 'warning'}>
                                {comm.status}
                              </Badge>
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Communication Templates">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Pre-built templates for common communications.</p>
                    <div className="space-y-2">
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <FileText className="w-4 h-4 mr-2" />
                        Monthly Report
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Issue Alert
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <Award className="w-4 h-4 mr-2" />
                        Project Update
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card title="Schedule Communication">
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Automated communication schedules.</p>
                    <div className="space-y-2">
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <Calendar className="w-4 h-4 mr-2" />
                        Monthly Reports
                      </Button>
                      <Button variant="secondary" className="w-full justify-start text-sm">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Performance Alerts
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-6">
              <Card title="Client Documents">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">Shared documents and files</p>
                    <Button variant="primary" size="sm">
                      <Upload className="w-4 h-4 mr-1" />
                      Upload Document
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { name: 'Contract_Agreement.pdf', type: 'PDF', size: '2.3 MB', date: new Date('2024-01-15') },
                      { name: 'SOW_Q4_2024.pdf', type: 'PDF', size: '1.8 MB', date: new Date('2024-09-01') },
                      { name: 'Monthly_Report_October.pdf', type: 'PDF', size: '456 KB', date: new Date('2024-10-01') },
                    ].map((doc, index) => (
                      <div key={index} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-8 h-8 text-gray-400" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                            <p className="text-xs text-gray-500">
                              {doc.type} • {doc.size} • {doc.date.toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Edit Client Modal (simplified version) */}
      {showEditClient && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Edit Client Information</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowEditClient(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                <input
                  type="text"
                  defaultValue={clientData.name}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  defaultValue={clientData.email}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rate</label>
                <input
                  type="number"
                  defaultValue={clientData.monthly_rate}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Status</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="active">Active</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                defaultValue={clientData.notes}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button variant="secondary" onClick={() => setShowEditClient(false)}>
                Cancel
              </Button>
              <Button variant="primary">
                Save Changes
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

export default ClientInfo