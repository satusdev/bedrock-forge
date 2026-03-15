import React from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import { ExternalLink, Globe, AlertTriangle, CheckCircle } from 'lucide-react'

export interface DomainProps {
  id: number
  domain_name: string
  registrar: string
  expiry_date: string
  status: 'active' | 'expired' | 'pending_transfer'
  auto_renew: boolean
  days_until_expiry: number
}

interface DomainCardProps {
  domain: DomainProps
}

const DomainCard: React.FC<DomainCardProps> = ({ domain }) => {
  const isExpiringSoon = domain.days_until_expiry <= 30
  const isExpired = domain.days_until_expiry < 0

  return (
    <Card className={`hover:shadow-md transition-shadow ${isExpired ? 'border-red-300' : isExpiringSoon ? 'border-yellow-300' : ''}`}>
      <div className="p-5">
        <div className="flex justify-between items-start">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isExpired ? 'bg-red-100' : 'bg-blue-100'}`}>
              <Globe className={`w-6 h-6 ${isExpired ? 'text-red-600' : 'text-blue-600'}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{domain.domain_name}</h3>
              <p className="text-sm text-gray-500">{domain.registrar}</p>
            </div>
          </div>
          <Badge className={
            domain.status === 'active' ? 'bg-green-100 text-green-800' : 
            domain.status === 'expired' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }>
            {domain.status}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Expires</p>
            <p className={`font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : 'text-gray-900'}`}>
              {domain.expiry_date}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Auto Renew</p>
            <p className="font-medium text-gray-900">
              {domain.auto_renew ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>

        {isExpiringSoon && !isExpired && (
          <div className="mt-4 flex items-center text-sm text-yellow-700 bg-yellow-50 p-2 rounded">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Expires in {domain.days_until_expiry} days
          </div>
        )}

        {isExpired && (
          <div className="mt-4 flex items-center text-sm text-red-700 bg-red-50 p-2 rounded">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Expired {Math.abs(domain.days_until_expiry)} days ago
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end space-x-3">
            <button className="text-sm text-gray-600 hover:text-gray-900">WHOIS</button>
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">Manage</button>
        </div>
      </div>
    </Card>
  )
}

export default DomainCard
