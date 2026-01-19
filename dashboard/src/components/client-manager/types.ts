/**
 * Shared types for Client Manager components
 */

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  company: string
  billing_status: 'active' | 'inactive' | 'trial' | 'overdue'
  monthly_rate: number
  contract_start: Date
  contract_end: Date
  notes: string
  projects: string[]
  total_revenue: number
  primary_contact: {
    name: string
    email: string
  }
  billing_address?: string
  shipping_address?: string
  payment_terms: string
  invoice_prefix: string
  auto_billing: boolean
  late_fee_rate: number
  currency: string
}

export interface Invoice {
  id: string
  client_id: string
  invoice_number: string
  amount: number
  status: 'paid' | 'pending' | 'overdue' | 'cancelled'
  issue_date: Date
  due_date: Date
  paid_date?: Date
  items: {
    description: string
    quantity: number
    unit_price: number
    total: number
  }[]
  subtotal: number
  tax_amount: number
  total: number
  notes?: string
  payment_method?: string
}

export interface Project {
  id: string
  name: string
  domain: string
  status: 'active' | 'development' | 'maintenance' | 'completed'
  monthly_rate: number
  start_date: Date
  last_updated: Date
}

export const getBillingStatusColor = (status: Client['billing_status']) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800'
    case 'inactive': return 'bg-gray-100 text-gray-800'
    case 'trial': return 'bg-blue-100 text-blue-800'
    case 'overdue': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export const getInvoiceStatusColor = (status: Invoice['status']) => {
  switch (status) {
    case 'paid': return 'bg-green-100 text-green-800'
    case 'pending': return 'bg-yellow-100 text-yellow-800'
    case 'overdue': return 'bg-red-100 text-red-800'
    case 'cancelled': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export const getProjectStatusColor = (status: Project['status']) => {
  switch (status) {
    case 'active': return 'bg-green-100 text-green-800'
    case 'development': return 'bg-blue-100 text-blue-800'
    case 'maintenance': return 'bg-yellow-100 text-yellow-800'
    case 'completed': return 'bg-gray-100 text-gray-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}
