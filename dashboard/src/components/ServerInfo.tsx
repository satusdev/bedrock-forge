import React, { useState } from 'react'
import {
  Server,
  Cpu,
  HardDrive,
  Shield,
  Globe,
  AlertTriangle,
  CheckCircle,
  Activity,
  Settings,
  RefreshCw,
  Terminal,
  Key,
  ExternalLink,
  Calendar,
  DollarSign,
  Zap,
  Database,
  Monitor,
  MapPin,
  Cloud
} from 'lucide-react'
import Card from './ui/Card'
import Badge from './ui/Badge'
import Button from './ui/Button'

interface ServerInfoProps {
  project: any
}

const ServerInfo: React.FC<ServerInfoProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState('overview')

  // Mock server data - in real implementation this would come from API
  const serverData = project.server || {
    provider: 'hetzner',
    server_ip: '192.168.1.100',
    ssh_user: 'root',
    ssh_port: 22,
    ssh_key_path: '/home/user/.ssh/id_rsa',
    server_name: 'web-server-01',
    location: 'Nuremberg, Germany',
    specs: {
      cpu: '4 Cores',
      memory: '8 GB RAM',
      storage: '160 GB SSD',
      bandwidth: '20 TB/month'
    },
    resource_usage: {
      cpu: 45.2,
      memory: 62.8,
      disk: 38.5,
      bandwidth: 12.3
    },
    monthly_cost: 25.90,
    renewal_date: new Date('2024-12-15')
  }

  const sslCertificate = project.ssl_certificate || {
    domain: project.get_primary_url()?.replace(/^https?:\/\//, '') || 'example.com',
    status: 'valid',
    issuer: 'Let\'s Encrypt Authority X3',
    issued_date: new Date('2024-09-15'),
    expiry_date: new Date('2024-12-15'),
    auto_renewal: true
  }

  const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'hetzner': return Monitor
      case 'digitalocean': return Globe
      case 'aws': return Cloud
      case 'vultr': return Zap
      case 'cyberpanel': return Database
      default: return Server
    }
  }

  const getProviderColor = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'hetzner': return 'text-red-600 bg-red-100'
      case 'digitalocean': return 'text-blue-600 bg-blue-100'
      case 'aws': return 'text-orange-600 bg-orange-100'
      case 'vultr': return 'text-purple-600 bg-purple-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getResourceColor = (usage: number) => {
    if (usage >= 90) return 'text-red-600 bg-red-100'
    if (usage >= 75) return 'text-yellow-600 bg-yellow-100'
    return 'text-green-600 bg-green-100'
  }

  const getSSLStatusColor = (status: string) => {
    switch (status) {
      case 'valid': return 'text-green-600 bg-green-100'
      case 'expiring_soon': return 'text-yellow-600 bg-yellow-100'
      case 'expired': return 'text-red-600 bg-red-100'
      case 'not_installed': return 'text-gray-600 bg-gray-100'
      default: return 'text-red-600 bg-red-100'
    }
  }

  const getDaysUntilExpiry = (expiryDate: Date) => {
    const now = new Date()
    const diffTime = expiryDate.getTime() - now.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const tabs = [
    { id: 'overview', name: 'Overview', icon: Server },
    { id: 'resources', name: 'Resources', icon: Activity },
    { id: 'ssl', name: 'SSL Certificate', icon: Shield },
    { id: 'ssh', name: 'SSH Access', icon: Terminal },
    { id: 'billing', name: 'Billing', icon: DollarSign }
  ]

  const ProviderIcon = getProviderIcon(serverData.provider)
  const providerColorClass = getProviderColor(serverData.provider)
  const sslStatusColor = getSSLStatusColor(sslCertificate.status)
  const daysUntilExpiry = getDaysUntilExpiry(sslCertificate.expiry_date)

  return (
    <div className="p-6 space-y-6">
      {/* Server Header */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-lg ${providerColorClass}`}>
              <ProviderIcon className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">{serverData.server_name}</h3>
              <p className="text-sm text-gray-500">{serverData.provider.toUpperCase()} • {serverData.server_ip}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">${serverData.monthly_cost}/month</p>
              <p className="text-xs text-gray-500">Renews {serverData.renewal_date.toLocaleDateString()}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="secondary" size="sm">
                <Settings className="w-4 h-4 mr-1" />
                Manage
              </Button>
              <Button variant="secondary" size="sm">
                <ExternalLink className="w-4 h-4 mr-1" />
                Control Panel
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
                <Card title="Connection Status">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">SSH Connection</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">HTTP Server</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Database</span>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">SSL Certificate</span>
                      <Shield className={`w-4 h-4 ${sslCertificate.status === 'valid' ? 'text-green-500' : 'text-yellow-500'}`} />
                    </div>
                  </div>
                </Card>

                <Card title="Server Location">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium">{serverData.location}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Globe className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">{serverData.server_ip}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Server className="w-4 h-4 text-gray-400" />
                      <span className="text-sm">{serverData.server_name}</span>
                    </div>
                  </div>
                </Card>

                <Card title="SSH Access">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">User</span>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{serverData.ssh_user}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Port</span>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">{serverData.ssh_port}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Key Path</span>
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded truncate max-w-[120px]">
                        {serverData.ssh_key_path?.split('/').pop()}
                      </code>
                    </div>
                  </div>
                </Card>

                <Card title="Quick Actions">
                  <div className="space-y-2">
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <Terminal className="w-4 h-4 mr-2" />
                      Open SSH Terminal
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Restart Services
                    </Button>
                    <Button variant="secondary" className="w-full justify-start text-sm">
                      <FileText className="w-4 h-4 mr-2" />
                      View Logs
                    </Button>
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card title="Hardware Specifications">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">CPU</span>
                      <span className="text-sm font-medium">{serverData.specs.cpu}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Memory</span>
                      <span className="text-sm font-medium">{serverData.specs.memory}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Storage</span>
                      <span className="text-sm font-medium">{serverData.specs.storage}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Bandwidth</span>
                      <span className="text-sm font-medium">{serverData.specs.bandwidth}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Provider Information">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${providerColorClass}`}>
                        <ProviderIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{serverData.provider.toUpperCase()}</p>
                        <p className="text-xs text-gray-500">Hosting Provider</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Server IP</span>
                        <span className="font-medium">{serverData.server_ip}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Location</span>
                        <span className="font-medium">{serverData.location}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Monthly Cost</span>
                        <span className="font-medium">${serverData.monthly_cost}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Renewal Date</span>
                        <span className="font-medium">{serverData.renewal_date.toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* Resources Tab */}
          {activeTab === 'resources' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card title="CPU Usage">
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900">{serverData.resource_usage.cpu}%</div>
                      <p className="text-sm text-gray-500">Current Load</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getResourceColor(serverData.resource_usage.cpu).split(' ')[0]}`}
                        style={{ width: `${serverData.resource_usage.cpu}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>4 Cores</span>
                      <span>{serverData.resource_usage.cpu > 75 ? 'High Load' : 'Normal'}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Memory Usage">
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900">{serverData.resource_usage.memory}%</div>
                      <p className="text-sm text-gray-500">RAM Used</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getResourceColor(serverData.resource_usage.memory).split(' ')[0]}`}
                        style={{ width: `${serverData.resource_usage.memory}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>5.1 GB / 8 GB</span>
                      <span>{serverData.resource_usage.memory > 75 ? 'High Usage' : 'Normal'}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Disk Usage">
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900">{serverData.resource_usage.disk}%</div>
                      <p className="text-sm text-gray-500">Storage Used</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getResourceColor(serverData.resource_usage.disk).split(' ')[0]}`}
                        style={{ width: `${serverData.resource_usage.disk}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>61.6 GB / 160 GB</span>
                      <span>{serverData.resource_usage.disk > 80 ? 'Low Space' : 'Healthy'}</span>
                    </div>
                  </div>
                </Card>

                <Card title="Bandwidth">
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900">{serverData.resource_usage.bandwidth}%</div>
                      <p className="text-sm text-gray-500">Monthly Used</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getResourceColor(serverData.resource_usage.bandwidth).split(' ')[0]}`}
                        style={{ width: `${serverData.resource_usage.bandwidth}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>2.4 TB / 20 TB</span>
                      <span>{serverData.resource_usage.bandwidth > 80 ? 'High Usage' : 'Normal'}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <Card title="Resource Monitoring">
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Real-time server resource monitoring with 24-hour history.</p>

                  {/* Resource Chart Placeholder */}
                  <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <TrendingUp className="w-12 h-12 mx-auto mb-2" />
                      <p className="text-sm">Resource usage charts would appear here</p>
                      <p className="text-xs">24-hour historical data with real-time updates</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">99.9%</p>
                      <p className="text-sm text-gray-500">Uptime (30 days)</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">1.2s</p>
                      <p className="text-sm text-gray-500">Avg Response Time</p>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900">42</p>
                      <p className="text-sm text-gray-500">Processes Running</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* SSL Certificate Tab */}
          {activeTab === 'ssl' && (
            <div className="space-y-6">
              <Card title="SSL Certificate Information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Domain</span>
                      <span className="text-sm text-gray-600">{sslCertificate.domain}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Status</span>
                      <Badge variant={sslCertificate.status === 'valid' ? 'success' : sslCertificate.status === 'expiring_soon' ? 'warning' : 'error'}>
                        {sslCertificate.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Issuer</span>
                      <span className="text-sm text-gray-600">{sslCertificate.issuer}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Auto-renewal</span>
                      <Badge variant={sslCertificate.auto_renewal ? 'success' : 'warning'}>
                        {sslCertificate.auto_renewal ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Issued Date</span>
                      <span className="text-sm text-gray-600">{sslCertificate.issued_date.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Expiry Date</span>
                      <span className="text-sm text-gray-600">{sslCertificate.expiry_date.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">Days Until Expiry</span>
                      <Badge variant={daysUntilExpiry <= 30 ? 'warning' : 'success'}>
                        {daysUntilExpiry} days
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">SSL Actions</p>
                      <p className="text-xs text-gray-500">Manage SSL certificate and security settings</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button variant="secondary">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Renew Certificate
                      </Button>
                      <Button variant="secondary">
                        <Shield className="w-4 h-4 mr-2" />
                        Security Check
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              {daysUntilExpiry <= 30 && (
                <Card>
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">SSL Certificate Expiring Soon</p>
                      <p className="text-xs text-gray-600">Your SSL certificate will expire in {daysUntilExpiry} days. Auto-renewal is {sslCertificate.auto_renewal ? 'enabled' : 'disabled'}.</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* SSH Access Tab */}
          {activeTab === 'ssh' && (
            <div className="space-y-6">
              <Card title="SSH Connection Details">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Host</span>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">{serverData.server_ip}</code>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Port</span>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">{serverData.ssh_port}</code>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">User</span>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">{serverData.ssh_user}</code>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Auth Method</span>
                        <Badge variant="success">SSH Key</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Key Path</span>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {serverData.ssh_key_path?.split('/').pop()}
                        </code>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">Fingerprint</span>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          SHA256:abc123...
                        </code>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-3">
                    <Button variant="primary">
                      <Terminal className="w-4 h-4 mr-2" />
                      Open SSH Terminal
                    </Button>
                    <Button variant="secondary">
                      <Key className="w-4 h-4 mr-2" />
                      Manage Keys
                    </Button>
                    <Button variant="secondary">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Test Connection
                    </Button>
                  </div>
                </div>
              </Card>

              <Card title="SSH Terminal">
                <div className="h-96 bg-black rounded-lg p-4 font-mono text-sm text-green-400">
                  <div className="space-y-1">
                    <p>$ Welcome to {serverData.server_name}</p>
                    <p>Last login: Mon Oct 7 10:30:45 2024 from 192.168.1.1</p>
                    <p>$ _</p>
                  </div>
                  <div className="mt-4 text-gray-400 text-xs">
                    <p>SSH terminal interface would appear here</p>
                    <p>Interactive command execution with real-time output</p>
                    <p>Supports commands: ls, cd, nano, top, htop, etc.</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <Card title="Server Billing Information">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900">${serverData.monthly_cost}</div>
                    <p className="text-sm text-gray-500">Monthly Cost</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900">${(serverData.monthly_cost * 12).toFixed(2)}</div>
                    <p className="text-sm text-gray-500">Annual Cost</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-gray-900">
                      {Math.ceil((serverData.renewal_date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}
                    </div>
                    <p className="text-sm text-gray-500">Days Until Renewal</p>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Next Renewal</p>
                      <p className="text-xs text-gray-500">{serverData.renewal_date.toLocaleDateString()} • ${serverData.monthly_cost}</p>
                    </div>
                    <Button variant="primary">
                      <Calendar className="w-4 h-4 mr-2" />
                      Manage Renewal
                    </Button>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card title="Cost Analysis">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Server Cost</span>
                      <span className="text-sm font-medium">${serverData.monthly_cost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Domain Costs</span>
                      <span className="text-sm font-medium">$15.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">SSL Certificate</span>
                      <span className="text-sm font-medium">$0.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Backup Storage</span>
                      <span className="text-sm font-medium">$8.00</span>
                    </div>
                    <div className="pt-3 border-t border-gray-200">
                      <div className="flex justify-between font-medium">
                        <span className="text-sm">Total Monthly</span>
                        <span className="text-sm">${(serverData.monthly_cost + 23).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card title="Usage Metrics">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Monthly Revenue</span>
                      <span className="text-sm font-medium text-green-600">$450.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Monthly Expenses</span>
                      <span className="text-sm font-medium text-red-600">${(serverData.monthly_cost + 23).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Net Profit</span>
                      <span className="text-sm font-medium text-blue-600">$401.10</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Profit Margin</span>
                      <span className="text-sm font-medium">89.1%</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ServerInfo