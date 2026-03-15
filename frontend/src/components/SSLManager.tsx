import React, { useState, useEffect } from 'react';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

interface SSLCertificate {
  id: string;
  domain: string;
  issuer: string;
  status: 'valid' | 'expiring' | 'expired' | 'error';
  valid_from: Date;
  valid_until: Date;
  days_remaining: number;
  auto_renew: boolean;
  certificate_type: 'lets_encrypt' | 'commercial' | 'self_signed';
  protocol: 'https' | 'ftp' | 'mail';
  key_size: number;
  signature_algorithm: string;
  san_domains?: string[];
  installed_on: string;
  last_checked: Date;
  check_frequency: 'daily' | 'weekly' | 'monthly';
  renewal_threshold: number;
  contact_email: string;
  notes?: string;
}

interface SSLManagerProps {
  projectId: string;
}

const SSLManager: React.FC<SSLManagerProps> = ({ projectId }) => {
  const [certificates, setCertificates] = useState<SSLCertificate[]>([
    {
      id: 'ssl_001',
      domain: 'acme.com',
      issuer: "Let's Encrypt Authority X3",
      status: 'valid',
      valid_from: new Date('2024-07-15'),
      valid_until: new Date('2024-10-15'),
      days_remaining: 68,
      auto_renew: true,
      certificate_type: 'lets_encrypt',
      protocol: 'https',
      key_size: 2048,
      signature_algorithm: 'SHA256withRSA',
      san_domains: ['www.acme.com', 'api.acme.com'],
      installed_on: 'nginx/1.18.0',
      last_checked: new Date(),
      check_frequency: 'daily',
      renewal_threshold: 30,
      contact_email: 'admin@acme.com',
      notes: 'Primary domain certificate'
    },
    {
      id: 'ssl_002',
      domain: 'staging.acme.com',
      issuer: "Let's Encrypt Authority X3",
      status: 'expiring',
      valid_from: new Date('2024-04-20'),
      valid_until: new Date('2024-07-20'),
      days_remaining: 12,
      auto_renew: false,
      certificate_type: 'lets_encrypt',
      protocol: 'https',
      key_size: 2048,
      signature_algorithm: 'SHA256withRSA',
      installed_on: 'apache/2.4.41',
      last_checked: new Date(),
      check_frequency: 'daily',
      renewal_threshold: 14,
      contact_email: 'staging@acme.com',
      notes: 'Staging environment - manual renewal required'
    },
    {
      id: 'ssl_003',
      domain: 'old-legacy.acme.com',
      issuer: 'Self-Signed',
      status: 'expired',
      valid_from: new Date('2023-01-10'),
      valid_until: new Date('2024-01-10'),
      days_remaining: -240,
      auto_renew: false,
      certificate_type: 'self_signed',
      protocol: 'https',
      key_size: 1024,
      signature_algorithm: 'SHA1withRSA',
      installed_on: 'nginx/1.14.0',
      last_checked: new Date(),
      check_frequency: 'weekly',
      renewal_threshold: 30,
      contact_email: 'legacy@acme.com',
      notes: 'Legacy domain - needs immediate attention'
    },
    {
      id: 'ssl_004',
      domain: 'mail.acme.com',
      issuer: 'DigiCert Inc',
      status: 'valid',
      valid_from: new Date('2024-01-05'),
      valid_until: new Date('2025-01-05'),
      days_remaining: 120,
      auto_renew: true,
      certificate_type: 'commercial',
      protocol: 'mail',
      key_size: 4096,
      signature_algorithm: 'SHA384withRSA',
      installed_on: 'postfix/3.4.14',
      last_checked: new Date(),
      check_frequency: 'weekly',
      renewal_threshold: 45,
      contact_email: 'postmaster@acme.com',
      notes: 'Commercial certificate for email server'
    }
  ]);

  const [activeTab, setActiveTab] = useState<'overview' | 'certificates' | 'monitoring' | 'automation' | 'tools'>('overview');
  const [selectedCertificate, setSelectedCertificate] = useState<SSLCertificate | null>(null);
  const [showRenewModal, setShowRenewModal] = useState(false);

  const getStatusColor = (status: SSLCertificate['status']) => {
    switch (status) {
      case 'valid': return 'bg-green-100 text-green-800';
      case 'expiring': return 'bg-yellow-100 text-yellow-800';
      case 'expired': return 'bg-red-100 text-red-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getDaysColor = (days: number) => {
    if (days < 0) return 'text-red-600';
    if (days <= 7) return 'text-red-500';
    if (days <= 14) return 'text-yellow-500';
    if (days <= 30) return 'text-yellow-400';
    return 'text-green-500';
  };

  const validCertificates = certificates.filter(cert => cert.status === 'valid').length;
  const expiringCertificates = certificates.filter(cert => cert.status === 'expiring').length;
  const expiredCertificates = certificates.filter(cert => cert.status === 'expired').length;
  const errorCertificates = certificates.filter(cert => cert.status === 'error').length;

  const totalCertificates = certificates.length;
  const healthScore = Math.round((validCertificates / totalCertificates) * 100);

  const OverviewTab = () => (
    <div className="space-y-6">
      {/* SSL Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Certificates</p>
                <p className="text-2xl font-bold text-gray-900">{totalCertificates}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valid</p>
                <p className="text-2xl font-bold text-green-600">{validCertificates}</p>
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
                <p className="text-sm font-medium text-gray-600">Expiring</p>
                <p className="text-2xl font-bold text-yellow-600">{expiringCertificates}</p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Expired</p>
                <p className="text-2xl font-bold text-red-600">{expiredCertificates}</p>
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

      {/* SSL Health Score */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">SSL Health Score</h3>
          <div className="flex items-center space-x-6">
            <div className="flex-1">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Overall Health</span>
                <span className="text-sm font-medium text-gray-700">{healthScore}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full ${
                    healthScore >= 90 ? 'bg-green-500' :
                    healthScore >= 70 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${
                healthScore >= 90 ? 'text-green-600' :
                healthScore >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {healthScore}%
              </div>
              <p className="text-sm text-gray-500">Health Score</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Recent Activity */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent SSL Activity</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="bg-yellow-100 p-2 rounded-lg">
                  <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">staging.acme.com expiring soon</p>
                  <p className="text-xs text-gray-500">Certificate expires in 12 days</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">2 hours ago</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 p-2 rounded-lg">
                  <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">old-legacy.acme.com expired</p>
                  <p className="text-xs text-gray-500">Certificate expired 240 days ago</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">1 day ago</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">acme.com renewed successfully</p>
                  <p className="text-xs text-gray-500">Auto-renewal completed</p>
                </div>
              </div>
              <span className="text-xs text-gray-500">3 days ago</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const CertificatesTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">SSL Certificates</h3>
        <Button>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Certificate
        </Button>
      </div>

      <div className="bg-white rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires In</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Auto-Renew</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {certificates.map((cert) => (
              <tr key={cert.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{cert.domain}</div>
                    <div className="text-xs text-gray-500">{cert.installed_on}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge className={getStatusColor(cert.status)}>
                    {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{cert.certificate_type.replace('_', ' ')}</div>
                  <div className="text-xs text-gray-500">{cert.protocol.toUpperCase()}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`text-sm font-medium ${getDaysColor(cert.days_remaining)}`}>
                    {cert.days_remaining > 0 ? `${cert.days_remaining} days` : `${Math.abs(cert.days_remaining)} days ago`}
                  </div>
                  <div className="text-xs text-gray-500">
                    {cert.valid_until.toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Badge className={cert.auto_renew ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {cert.auto_renew ? 'Enabled' : 'Disabled'}
                  </Badge>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setSelectedCertificate(cert)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View
                    </button>
                    <button
                      onClick={() => setShowRenewModal(true)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Renew
                    </button>
                    <button className="text-gray-600 hover:text-gray-900">
                      Configure
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

  const MonitoringTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Monitoring Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Check Frequency</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Alert Threshold</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="7">7 days before expiry</option>
                <option value="14">14 days before expiry</option>
                <option value="30">30 days before expiry</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notification Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Slack Webhook</label>
              <input
                type="url"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="https://hooks.slack.com/..."
              />
            </div>
          </div>
          <div className="mt-6">
            <Button>Save Monitoring Settings</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">SSL Test Results</h3>
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">acme.com</h4>
                <span className="text-sm text-gray-500">Last checked: 2 hours ago</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Certificate Valid</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Chain Complete</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Protocol Support: TLSv1.3</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">staging.acme.com</h4>
                <span className="text-sm text-gray-500">Last checked: 2 hours ago</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <span className="text-sm">Certificate Expiring</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Chain Complete</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm">Protocol Support: TLSv1.2</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const AutomationTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Auto-Renewal Settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Let's Encrypt Integration</h4>
                <p className="text-sm text-gray-500">Automatic certificate renewal via ACME protocol</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-green-600">Connected</span>
                <button className="text-indigo-600 hover:text-indigo-900">Configure</button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">Commercial CA Integration</h4>
                <p className="text-sm text-gray-500">Integration with commercial certificate authorities</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-500">Not Connected</span>
                <button className="text-indigo-600 hover:text-indigo-900">Setup</button>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h4 className="font-medium">DNS Challenge Provider</h4>
                <p className="text-sm text-gray-500">Automatic DNS validation for wildcard certificates</p>
              </div>
              <div className="flex items-center space-x-3">
                <select className="px-3 py-1 border border-gray-300 rounded-md text-sm">
                  <option>Cloudflare</option>
                  <option>Route 53</option>
                  <option>DigitalOcean</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Renewal Schedule</h3>
          <div className="space-y-3">
            {certificates.filter(cert => cert.auto_renew).map((cert) => (
              <div key={cert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{cert.domain}</p>
                  <p className="text-xs text-gray-500">Next renewal: {cert.valid_until.toLocaleDateString()}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-blue-100 text-blue-800">
                    {cert.renewal_threshold} days before expiry
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );

  const ToolsTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">SSL Tools</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button className="p-4 border rounded-lg hover:bg-gray-50 text-left">
              <div className="flex items-center space-x-3">
                <div className="bg-indigo-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">SSL Checker</p>
                  <p className="text-sm text-gray-500">Analyze SSL certificate details</p>
                </div>
              </div>
            </button>

            <button className="p-4 border rounded-lg hover:bg-gray-50 text-left">
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Generate CSR</p>
                  <p className="text-sm text-gray-500">Create certificate signing request</p>
                </div>
              </div>
            </button>

            <button className="p-4 border rounded-lg hover:bg-gray-50 text-left">
              <div className="flex items-center space-x-3">
                <div className="bg-yellow-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Import Certificate</p>
                  <p className="text-sm text-gray-500">Upload existing certificate</p>
                </div>
              </div>
            </button>

            <button className="p-4 border rounded-lg hover:bg-gray-50 text-left">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Certificate Converter</p>
                  <p className="text-sm text-gray-500">Convert between formats</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Quick SSL Test</h3>
          <div className="flex space-x-3">
            <input
              type="text"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter domain to test SSL..."
            />
            <Button>Test SSL</Button>
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
          <h2 className="text-2xl font-bold text-gray-900">SSL Certificate Manager</h2>
          <p className="text-gray-600">Manage and monitor SSL certificates across all domains</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline">Export Report</Button>
          <Button>Scan All Domains</Button>
        </div>
      </div>

      {/* Alert Banner */}
      {(expiringCertificates > 0 || expiredCertificates > 0) && (
        <div className={`p-4 rounded-lg ${
          expiredCertificates > 0 ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              expiredCertificates > 0 ? 'bg-red-100' : 'bg-yellow-100'
            }`}>
              <svg className={`w-5 h-5 ${
                expiredCertificates > 0 ? 'text-red-600' : 'text-yellow-600'
              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className={`font-medium ${
                expiredCertificates > 0 ? 'text-red-800' : 'text-yellow-800'
              }`}>
                {expiredCertificates > 0 ? `${expiredCertificates} certificate(s) expired` : `${expiringCertificates} certificate(s) expiring soon`}
              </p>
              <p className={`text-sm ${
                expiredCertificates > 0 ? 'text-red-600' : 'text-yellow-600'
              }`}>
                Immediate action required to maintain security
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('certificates')}
            >
              View Certificates
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'certificates', label: 'Certificates' },
            { key: 'monitoring', label: 'Monitoring' },
            { key: 'automation', label: 'Automation' },
            { key: 'tools', label: 'Tools' }
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
      {activeTab === 'certificates' && <CertificatesTab />}
      {activeTab === 'monitoring' && <MonitoringTab />}
      {activeTab === 'automation' && <AutomationTab />}
      {activeTab === 'tools' && <ToolsTab />}

      {/* Certificate Details Modal */}
      {selectedCertificate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Certificate Details</h3>
              <button
                onClick={() => setSelectedCertificate(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Domain</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.domain}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <Badge className={getStatusColor(selectedCertificate.status)}>
                    {selectedCertificate.status}
                  </Badge>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Issuer</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.issuer}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Certificate Type</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.certificate_type.replace('_', ' ')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Valid From</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.valid_from.toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Valid Until</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.valid_until.toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Key Size</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.key_size} bits</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Signature Algorithm</label>
                  <p className="text-sm text-gray-900">{selectedCertificate.signature_algorithm}</p>
                </div>
              </div>

              {selectedCertificate.san_domains && selectedCertificate.san_domains.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subject Alternative Names</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCertificate.san_domains.map((domain, index) => (
                      <Badge key={index} className="bg-gray-100 text-gray-800">
                        {domain}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <p className="text-sm text-gray-900">{selectedCertificate.notes || 'No notes'}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setSelectedCertificate(null)}>
                Close
              </Button>
              <Button onClick={() => setShowRenewModal(true)}>
                Renew Certificate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Modal */}
      {showRenewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Renew Certificate</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Renewal Method</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option>Let's Encrypt (Free)</option>
                  <option>Commercial Certificate</option>
                  <option>Self-Signed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Validity Period</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option>90 days</option>
                  <option>180 days</option>
                  <option>1 year</option>
                  <option>2 years</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enable-auto-renew"
                  className="mr-2"
                  defaultChecked
                />
                <label htmlFor="enable-auto-renew" className="text-sm text-gray-700">
                  Enable auto-renewal for this certificate
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowRenewModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowRenewModal(false)}>
                Start Renewal
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SSLManager;