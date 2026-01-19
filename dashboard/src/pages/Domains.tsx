import React, { useState, useEffect } from 'react'
import { billingService } from '../services/billing'
import DomainCard, { DomainProps } from '../components/assets/DomainCard'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { Plus, RefreshCw, Search } from 'lucide-react'
import toast from 'react-hot-toast'

const Domains: React.FC = () => {
  const [domains, setDomains] = useState<DomainProps[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const fetchDomains = async () => {
    try {
      const data = await billingService.getDomains()
      // Transform backend data to match DomainProps
      const transformed = data.map((d: any) => ({
        id: d.id,
        domain_name: d.domain_name,
        registrar: d.registrar || 'Unknown',
        expiry_date: d.expiry_date,
        status: d.days_until_expiry <= 0 ? 'expired' : d.days_until_expiry <= 30 ? 'expiring' : 'active',
        auto_renew: d.auto_renew,
        days_until_expiry: d.days_until_expiry
      }))
      setDomains(transformed)
    } catch (error) {
      toast.error('Failed to load domains')
      setDomains([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDomains()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchDomains()
  }

  const filteredDomains = domains.filter(d => 
    d.domain_name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Domains</h1>
          <p className="text-gray-600">Track registration and DNS settings</p>
        </div>
        <div className="flex space-x-3 w-full sm:w-auto">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Register Domain
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Search domains..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDomains.length > 0 ? (
          filteredDomains.map(domain => (
            <DomainCard key={domain.id} domain={domain} />
          ))
        ) : domains.length === 0 ? (
          <div className="col-span-full text-center py-16 bg-white rounded-lg shadow">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">No domains registered</p>
            <p className="text-gray-400 text-sm mt-1">Register your first domain using the button above</p>
          </div>
        ) : (
          <div className="col-span-full text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 text-lg">No domains found matching "{searchTerm}"</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Domains

