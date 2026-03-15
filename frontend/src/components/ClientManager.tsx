import React, { useState } from 'react';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  billing_status: 'active' | 'inactive' | 'trial' | 'overdue';
  monthly_rate: number;
  contract_start: Date;
  contract_end: Date;
  notes: string;
  contact_person: string;
  address: string;
  website: string;
  industry: string;
  client_since: Date;
  projects_count: number;
  total_revenue: number;
  last_payment_date?: Date;
  next_payment_date: Date;
  payment_method: 'credit_card' | 'bank_transfer' | 'paypal' | 'stripe';
  billing_cycle: 'monthly' | 'quarterly' | 'annually';
  tax_rate: number;
  discount_rate?: number;
  support_level: 'basic' | 'premium' | 'enterprise';
  sla_hours: number;
  response_time: string;
  emergency_contact?: {
    name: string;
    phone: string;
    email: string;
  };
  billing_address?: string;
  shipping_address?: string;
  payment_terms: string;
  invoice_prefix: string;
  auto_billing: boolean;
  late_fee_rate: number;
  currency: string;
}

interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'cancelled';
  issue_date: Date;
  due_date: Date;
  paid_date?: Date;
  items: {
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }[];
  subtotal: number;
  tax_amount: number;
  total: number;
  notes?: string;
  payment_method?: string;
}

interface Project {
  id: string;
  name: string;
  domain: string;
  status: 'active' | 'development' | 'maintenance' | 'completed';
  monthly_rate: number;
  start_date: Date;
  last_updated: Date;
}

interface ClientManagerProps {
  projectId: string;
}

const ClientManager: React.FC<ClientManagerProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'clients' | 'billing' | 'projects' | 'communications'>('overview');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);

  const [clients, setClients] = useState<Client[]>([
    {
      id: 'client_001',
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
      client_since: new Date('2023-06-01'),
      projects_count: 3,
      total_revenue: 16200.00,
      last_payment_date: new Date('2024-09-15'),
      next_payment_date: new Date('2024-10-15'),
      payment_method: 'stripe',
      billing_cycle: 'monthly',
      tax_rate: 8.5,
      support_level: 'premium',
      sla_hours: 24,
      response_time: '4 hours',
      emergency_contact: {
        name: 'Jane Doe',
        phone: '+1 (555) 987-6543',
        email: 'jane@acme.com'
      },
      payment_terms: 'Net 15',
      invoice_prefix: 'ACM-',
      auto_billing: true,
      late_fee_rate: 1.5,
      currency: 'USD'
    },
    {
      id: 'client_002',
      name: 'Local Restaurant LLC',
      email: 'info@localrestaurant.com',
      phone: '+1 (555) 234-5678',
      company: 'Local Restaurant LLC',
      billing_status: 'overdue',
      monthly_rate: 150.00,
      contract_start: new Date('2024-03-01'),
      contract_end: new Date('2025-03-01'),
      notes: 'Small restaurant website. Occasional payment delays but always pays eventually.',
      contact_person: 'Maria Garcia',
      address: '456 Food Street, Los Angeles, CA 90001',
      website: 'https://localrestaurant.com',
      industry: 'Hospitality',
      client_since: new Date('2024-02-15'),
      projects_count: 1,
      total_revenue: 2400.00,
      last_payment_date: new Date('2024-08-01'),
      next_payment_date: new Date('2024-09-01'),
      payment_method: 'bank_transfer',
      billing_cycle: 'monthly',
      tax_rate: 7.5,
      support_level: 'basic',
      sla_hours: 48,
      response_time: '24 hours',
      payment_terms: 'Net 30',
      invoice_prefix: 'LR-',
      auto_billing: false,
      late_fee_rate: 2.0,
      currency: 'USD'
    },
    {
      id: 'client_003',
      name: 'Tech Startup Inc',
      email: 'tech@startup.io',
      phone: '+1 (555) 345-6789',
      company: 'Tech Startup Inc',
      billing_status: 'trial',
      monthly_rate: 750.00,
      contract_start: new Date('2024-09-01'),
      contract_end: new Date('2024-12-01'),
      notes: 'High-growth startup in trial period. Expected to convert to annual contract.',
      contact_person: 'Alex Chen',
      address: '789 Innovation Drive, San Francisco, CA 94105',
      website: 'https://startup.io',
      industry: 'Software',
      client_since: new Date('2024-08-15'),
      projects_count: 2,
      total_revenue: 1500.00,
      next_payment_date: new Date('2024-10-01'),
      payment_method: 'credit_card',
      billing_cycle: 'monthly',
      tax_rate: 8.75,
      discount_rate: 10,
      support_level: 'enterprise',
      sla_hours: 12,
      response_time: '1 hour',
      payment_terms: 'Net 15',
      invoice_prefix: 'TSI-',
      auto_billing: true,
      late_fee_rate: 1.0,
      currency: 'USD'
    }
  ]);

  const [invoices] = useState<Invoice[]>([
    {
      id: 'inv_001',
      client_id: 'client_001',
      invoice_number: 'ACM-2024-09-001',
      amount: 488.25,
      status: 'paid',
      issue_date: new Date('2024-09-01'),
      due_date: new Date('2024-09-15'),
      paid_date: new Date('2024-09-12'),
      items: [
        { description: 'WordPress Hosting & Maintenance', quantity: 1, unit_price: 450.00, total: 450.00 },
        { description: 'Tax (8.5%)', quantity: 1, unit_price: 38.25, total: 38.25 }
      ],
      subtotal: 450.00,
      tax_amount: 38.25,
      total: 488.25,
      payment_method: 'Stripe'
    },
    {
      id: 'inv_002',
      client_id: 'client_002',
      invoice_number: 'LR-2024-09-001',
      amount: 161.25,
      status: 'overdue',
      issue_date: new Date('2024-09-01'),
      due_date: new Date('2024-09-30'),
      items: [
        { description: 'Website Maintenance', quantity: 1, unit_price: 150.00, total: 150.00 },
        { description: 'Tax (7.5%)', quantity: 1, unit_price: 11.25, total: 11.25 }
      ],
      subtotal: 150.00,
      tax_amount: 11.25,
      total: 161.25
    },
    {
      id: 'inv_003',
      client_id: 'client_003',
      invoice_number: 'TSI-2024-09-001',
      amount: 675.00,
      status: 'pending',
      issue_date: new Date('2024-09-15'),
      due_date: new Date('2024-09-30'),
      items: [
        { description: 'Enterprise Hosting (10% discount applied)', quantity: 1, unit_price: 675.00, total: 675.00 }
      ],
      subtotal: 675.00,
      tax_amount: 0,
      total: 675.00
    }
  ]);

  const [projects] = useState<Project[]>([
    {
      id: 'proj_001',
      name: 'Acme Corporate Website',
      domain: 'acme.com',
      status: 'active',
      monthly_rate: 300.00,
      start_date: new Date('2023-06-01'),
      last_updated: new Date('2024-09-20')
    },
    {
      id: 'proj_002',
      name: 'Acme Blog Platform',
      domain: 'blog.acme.com',
      status: 'active',
      monthly_rate: 100.00,
      start_date: new Date('2023-08-15'),
      last_updated: new Date('2024-09-18')
    },
    {
      id: 'proj_003',
      name: 'Acme Internal Portal',
      domain: 'portal.acme.com',
      status: 'development',
      monthly_rate: 50.00,
      start_date: new Date('2024-01-10'),
      last_updated: new Date('2024-09-15')
    },
    {
      id: 'proj_004',
      name: 'Local Restaurant Website',
      domain: 'localrestaurant.com',
      status: 'active',
      monthly_rate: 150.00,
      start_date: new Date('2024-02-15'),
      last_updated: new Date('2024-09-10')
    },
    {
      id: 'proj_005',
      name: 'Tech Startup Main Site',
      domain: 'startup.io',
      status: 'development',
      monthly_rate: 500.00,
      start_date: new Date('2024-08-15'),
      last_updated: new Date('2024-09-22')
    },
    {
      id: 'proj_006',
      name: 'Tech Startup API',
      domain: 'api.startup.io',
      status: 'development',
      monthly_rate: 250.00,
      start_date: new Date('2024-09-01'),
      last_updated: new Date('2024-09-21')
    }
  ]);

  const getBillingStatusColor = (status: Client['billing_status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInvoiceStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const activeClients = clients.filter(c => c.billing_status === 'active').length;
  const trialClients = clients.filter(c => c.billing_status === 'trial').length;
  const overdueClients = clients.filter(c => c.billing_status === 'overdue').length;
  const totalMonthlyRevenue = clients.reduce((sum, c) =>
    c.billing_status === 'active' || c.billing_status === 'trial' ? sum + c.monthly_rate : sum, 0
  );
  const totalAnnualRevenue = totalMonthlyRevenue * 12;

  const OverviewTab = () => (
    <div className="space-y-6">
      {/* Revenue Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Clients</p>
                <p className="text-2xl font-bold text-gray-900">{clients.length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Clients</p>
                <p className="text-2xl font-bold text-green-600">{activeClients}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Monthly Revenue</p>
                <p className="text-2xl font-bold text-gray-900">${totalMonthlyRevenue.toFixed(2)}</p>
              </div>
              <div className="bg-indigo-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Overdue Clients</p>
                <p className="text-2xl font-bold text-red-600">{overdueClients}</p>
              </div>
              <div className="bg-red-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Revenue Overview</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Monthly Revenue</p>
              <p className="text-3xl font-bold text-gray-900">${totalMonthlyRevenue.toFixed(2)}</p>
              <p className="text-sm text-green-600 mt-2">↑ 12% from last month</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Annual Projection</p>
              <p className="text-3xl font-bold text-gray-900">${totalAnnualRevenue.toFixed(2)}</p>
              <p className="text-sm text-blue-600 mt-2">Based on current clients</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Average Revenue/Client</p>
              <p className="text-3xl font-bold text-gray-900">
                ${(totalMonthlyRevenue / (activeClients + trialClients)).toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-2">Per month</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Recent Activity */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Billing Activity</h3>
          <div className="space-y-3">
            {invoices.slice(0, 5).map((invoice) => {
              const client = clients.find(c => c.id === invoice.client_id);
              return (
                <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      invoice.status === 'paid' ? 'bg-green-500' :
                      invoice.status === 'overdue' ? 'bg-red-500' :
                      'bg-yellow-500'
                    }`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{invoice.invoice_number}</p>
                      <p className="text-xs text-gray-500">{client?.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">${invoice.total.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">{invoice.issue_date.toLocaleDateString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );

  const ClientsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Client Management</h3>
        <Button onClick={() => setShowClientModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </Button>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Rate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projects</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Payment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map((client) => (
              <tr key={client.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{client.name}</div>
                    <div className="text-xs text-gray-500">{client.contact_person}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge className={getBillingStatusColor(client.billing_status)}>
                    {client.billing_status.charAt(0).toUpperCase() + client.billing_status.slice(1)}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">${client.monthly_rate.toFixed(2)}</div>
                  {client.discount_rate && (
                    <div className="text-xs text-green-600">{client.discount_rate}% discount</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{client.projects_count}</div>
                  <div className="text-xs text-gray-500">Active projects</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{client.next_payment_date.toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500">{client.payment_method.replace('_', ' ')}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setSelectedClient(client)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View
                    </button>
                    <button className="text-green-600 hover:text-green-900">
                      Invoice
                    </button>
                    <button className="text-gray-600 hover:text-gray-900">
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const BillingTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Invoice Management</h3>
        <Button onClick={() => setShowInvoiceModal(true)}>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Create Invoice
        </Button>
      </div>

      {/* Invoice Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Paid</p>
              <p className="text-2xl font-bold text-green-600">
                {invoices.filter(i => i.status === 'paid').length}
              </p>
              <p className="text-xs text-gray-500">This month</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">
                {invoices.filter(i => i.status === 'pending').length}
              </p>
              <p className="text-xs text-gray-500">Awaiting payment</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Overdue</p>
              <p className="text-2xl font-bold text-red-600">
                {invoices.filter(i => i.status === 'overdue').length}
              </p>
              <p className="text-xs text-gray-500">Action required</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-600">Outstanding</p>
              <p className="text-2xl font-bold text-gray-900">
                ${invoices
                  .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
                  .reduce((sum, i) => sum + i.total, 0)
                  .toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">Total due</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Invoice List */}
      <div className="bg-white rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.map((invoice) => {
              const client = clients.find(c => c.id === invoice.client_id);
              return (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{invoice.invoice_number}</div>
                    <div className="text-xs text-gray-500">{invoice.issue_date.toLocaleDateString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{client?.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">${invoice.total.toFixed(2)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getInvoiceStatusColor(invoice.status)}>
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{invoice.due_date.toLocaleDateString()}</div>
                    {invoice.status === 'overdue' && (
                      <div className="text-xs text-red-600">Overdue</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button className="text-indigo-600 hover:text-indigo-900">
                        View
                      </button>
                      {invoice.status === 'pending' && (
                        <button className="text-green-600 hover:text-green-900">
                          Send Reminder
                        </button>
                      )}
                      <button className="text-gray-600 hover:text-gray-900">
                        Download
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const ProjectsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Project Management</h3>
        <Button>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => {
          const client = clients.find(c =>
            projects.filter(p => p.domain === project.domain).length > 0
          );
          return (
            <Card key={project.id}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900">{project.name}</h4>
                  <Badge className={
                    project.status === 'active' ? 'bg-green-100 text-green-800' :
                    project.status === 'development' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }>
                    {project.status}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9m0 9c-5 0-9-4-9-9s4-9 9-9" />
                    </svg>
                    {project.domain}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ${project.monthly_rate.toFixed(2)}/month
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Started: {project.start_date.toLocaleDateString()}
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                  <span className="text-xs text-gray-500">
                    Last updated: {project.last_updated.toLocaleDateString()}
                  </span>
                  <div className="flex space-x-2">
                    <button className="text-indigo-600 hover:text-indigo-900 text-sm">
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  const CommunicationsTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Communications</h3>
          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Email sent to Acme Corporation</p>
                  <p className="text-sm text-gray-600">Monthly report and invoice #ACM-2024-09-001</p>
                </div>
                <span className="text-xs text-gray-500">2 hours ago</span>
              </div>
            </div>

            <div className="border-l-4 border-yellow-500 pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Payment reminder sent</p>
                  <p className="text-sm text-gray-600">Local Restaurant LLC - Overdue invoice #LR-2024-09-001</p>
                </div>
                <span className="text-xs text-gray-500">1 day ago</span>
              </div>
            </div>

            <div className="border-l-4 border-green-500 pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Support call with Tech Startup Inc</p>
                  <p className="text-sm text-gray-600">Discussed enterprise support requirements and SLA</p>
                </div>
                <span className="text-xs text-gray-500">2 days ago</span>
              </div>
            </div>

            <div className="border-l-4 border-purple-500 pl-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Contract renewal discussion</p>
                  <p className="text-sm text-gray-600">Acme Corporation - Annual contract renewal proposal</p>
                </div>
                <span className="text-xs text-gray-500">3 days ago</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Communication Templates</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Monthly Invoice</h4>
              <p className="text-sm text-gray-600 mb-3">Automated monthly invoice delivery template</p>
              <button className="text-indigo-600 hover:text-indigo-900 text-sm">Edit Template</button>
            </div>
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Payment Reminder</h4>
              <p className="text-sm text-gray-600 mb-3">Friendly payment reminder for overdue invoices</p>
              <button className="text-indigo-600 hover:text-indigo-900 text-sm">Edit Template</button>
            </div>
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Welcome Email</h4>
              <p className="text-sm text-gray-600 mb-3">New client onboarding and welcome message</p>
              <button className="text-indigo-600 hover:text-indigo-900 text-sm">Edit Template</button>
            </div>
            <div className="border rounded-lg p-4">
              <h4 className="font-medium mb-2">Support Update</h4>
              <p className="text-sm text-gray-600 mb-3">Regular maintenance and support updates</p>
              <button className="text-indigo-600 hover:text-indigo-900 text-sm">Edit Template</button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Client Management</h2>
          <p className="text-gray-600">Manage clients, billing, and project relationships</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline">Export Report</Button>
          <Button>Send Bulk Invoice</Button>
        </div>
      </div>

      {/* Alert Banner */}
      {overdueClients > 0 && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-lg">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-red-800">
                {overdueClients} client(s) have overdue payments
              </p>
              <p className="text-sm text-red-600">
                Total outstanding: ${invoices
                  .filter(i => i.status === 'overdue')
                  .reduce((sum, i) => sum + i.total, 0)
                  .toFixed(2)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('billing')}
            >
              View Invoices
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'clients', label: 'Clients' },
            { key: 'billing', label: 'Billing & Invoices' },
            { key: 'projects', label: 'Projects' },
            { key: 'communications', label: 'Communications' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
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
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'clients' && <ClientsTab />}
      {activeTab === 'billing' && <BillingTab />}
      {activeTab === 'projects' && <ProjectsTab />}
      {activeTab === 'communications' && <CommunicationsTab />}

      {/* Client Details Modal */}
      {selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">{selectedClient.name}</h3>
              <button
                onClick={() => setSelectedClient(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-4">Client Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Contact Person</label>
                    <p className="text-sm text-gray-900">{selectedClient.contact_person}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="text-sm text-gray-900">{selectedClient.email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <p className="text-sm text-gray-900">{selectedClient.phone}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    <p className="text-sm text-gray-900">{selectedClient.address}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Website</label>
                    <p className="text-sm text-gray-900">{selectedClient.website}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Industry</label>
                    <p className="text-sm text-gray-900">{selectedClient.industry}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-4">Billing Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Billing Status</label>
                    <Badge className={getBillingStatusColor(selectedClient.billing_status)}>
                      {selectedClient.billing_status}
                    </Badge>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Monthly Rate</label>
                    <p className="text-sm text-gray-900">${selectedClient.monthly_rate.toFixed(2)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Billing Cycle</label>
                    <p className="text-sm text-gray-900">{selectedClient.billing_cycle}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                    <p className="text-sm text-gray-900">{selectedClient.payment_method.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Next Payment Date</label>
                    <p className="text-sm text-gray-900">{selectedClient.next_payment_date.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Total Revenue</label>
                    <p className="text-sm text-gray-900">${selectedClient.total_revenue.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-4">Support Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Support Level</label>
                    <p className="text-sm text-gray-900">{selectedClient.support_level}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">SLA Response Time</label>
                    <p className="text-sm text-gray-900">{selectedClient.response_time}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Emergency Contact</label>
                    <p className="text-sm text-gray-900">
                      {selectedClient.emergency_contact?.name} - {selectedClient.emergency_contact?.phone}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-4">Contract Information</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Contract Start</label>
                    <p className="text-sm text-gray-900">{selectedClient.contract_start.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Contract End</label>
                    <p className="text-sm text-gray-900">{selectedClient.contract_end.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Client Since</label>
                    <p className="text-sm text-gray-900">{selectedClient.client_since.toLocaleDateString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Active Projects</label>
                    <p className="text-sm text-gray-900">{selectedClient.projects_count}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <h4 className="font-medium mb-2">Notes</h4>
              <p className="text-sm text-gray-900">{selectedClient.notes}</p>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setSelectedClient(null)}>
                Close
              </Button>
              <Button onClick={() => setShowInvoiceModal(true)}>
                Create Invoice
              </Button>
              <Button>
                Edit Client
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Create Invoice</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Client</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowInvoiceModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowInvoiceModal(false)}>
                Create Invoice
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Add New Client</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Acme Corporation"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person *</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="contact@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rate *</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Billing Cycle</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="123 Business Ave, Suite 100, City, State 12345"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                <input
                  type="url"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="https://example.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="Additional notes about the client..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowClientModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowClientModal(false)}>
                Add Client
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientManager;