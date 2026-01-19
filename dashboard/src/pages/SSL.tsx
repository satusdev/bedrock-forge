import React, { useState, useEffect } from 'react'
import { billingService } from '../services/billing'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { RefreshCw, Plus, Shield, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'

// Interface based on what we expect from API, aligning with SSLManager
interface SSLCertificate {
  id: number
  domain: string
  issuer: string
  status: 'valid' | 'expiring' | 'expired' | 'error'
  valid_until: string
  auto_renew: boolean
  days_remaining: number
  certificate_type: string
}

const SSL: React.FC = () => {
  const [certificates, setCertificates] = useState<SSLCertificate[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchCertificates = async () => {
    try {
      const data = await billingService.getCertificates()
      // Transform backend data to match our interface
      const transformed = data.map((c: any) => ({
        id: c.id,
        domain: c.common_name || c.domain,
        issuer: c.provider || c.issuer,
        status: c.days_until_expiry <= 0 ? 'expired' : c.days_until_expiry <= 14 ? 'expiring' : 'valid',
        valid_until: c.expiry_date,
        auto_renew: c.auto_renew,
        days_remaining: c.days_until_expiry,
        certificate_type: c.type || 'standard'
      }))
      setCertificates(transformed)
    } catch (error) {
      toast.error('Failed to load certificates')
      setCertificates([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchCertificates()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchCertificates()
  }

  const handleRenew = async (id: number) => {
    try {
      await billingService.renewCertificate(id)
      toast.success('Renewal initiated')
      handleRefresh()
    } catch (error) {
      toast.error('Failed to renew certificate')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid': return 'bg-green-100 text-green-800'
      case 'expiring': return 'bg-yellow-100 text-yellow-800'
      case 'expired': return 'bg-red-100 text-red-800'
      case 'error': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const validCount = certificates.filter(c => c.status === 'valid').length
  const expiringCount = certificates.filter(c => c.status === 'expiring').length
  const expiredCount = certificates.filter(c => c.status === 'expired').length

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SSL Certificates</h1>
          <p className="text-gray-600">Global SSL management and monitoring</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Certificate
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{certificates.length}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg"><Shield className="w-6 h-6 text-blue-600" /></div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Valid</p>
              <p className="text-2xl font-bold text-green-600">{validCount}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg"><CheckCircle className="w-6 h-6 text-green-600" /></div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-2xl font-bold text-yellow-600">{expiringCount}</p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-lg"><AlertTriangle className="w-6 h-6 text-yellow-600" /></div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired</p>
              <p className="text-2xl font-bold text-red-600">{expiredCount}</p>
            </div>
            <div className="bg-red-100 p-3 rounded-lg"><XCircle className="w-6 h-6 text-red-600" /></div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auto-Renew</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {certificates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                    <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium">No SSL certificates</p>
                    <p className="text-xs mt-1">Add your first certificate using the button above</p>
                  </td>
                </tr>
              ) : (
                certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{cert.domain}</div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge className={getStatusColor(cert.status)}>
                      {cert.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {cert.issuer}
                  </td>
                  <td className="px-6 py-4">
                    <div className={`text-sm ${cert.days_remaining < 30 ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
                      {cert.valid_until}
                    </div>
                    <div className="text-xs text-gray-500">
                      {cert.days_remaining > 0 ? `${cert.days_remaining} days left` : `${Math.abs(cert.days_remaining)} days ago`}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                     <Badge className={cert.auto_renew ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                      {cert.auto_renew ? 'Yes' : 'No'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium">
                    <button 
                      onClick={() => handleRenew(cert.id)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Renew
                    </button>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default SSL

