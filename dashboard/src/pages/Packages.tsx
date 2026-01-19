import React, { useState, useEffect } from 'react'
import { billingService } from '../services/billing'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import PackageEditor from '../components/billing/PackageEditor'
import { Plus, RefreshCw, Edit, Server, Database, HardDrive, Globe } from 'lucide-react'
import toast from 'react-hot-toast'

interface Package {
  id: number
  name: string
  description?: string
  disk_quota_mb: number
  bandwidth_mb: number
  db_limit: number
  site_limit: number
  price_monthly: number
  price_yearly: number
  is_active: boolean
}

const Packages: React.FC = () => {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<Package | undefined>(undefined)

  const fetchPackages = async () => {
    try {
      const data = await billingService.getPackages()
      setPackages(data)
    } catch (error) {
      toast.error('Failed to load packages')
      setPackages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPackages()
  }, [])

  const handleEdit = (pkg: Package) => {
    setEditingPackage(pkg)
    setIsEditorOpen(true)
  }

  const handleCreate = () => {
    setEditingPackage(undefined)
    setIsEditorOpen(true)
  }

  const handleSave = async (data: any) => {
    // In a real app, call API to save/create
    console.log('Saving package:', data)
    toast.success('Package saved (mock)')
    setIsEditorOpen(false)
    fetchPackages() // Refresh list
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Hosting Packages</h1>
          <p className="text-gray-600">Define resource limits and pricing tiers</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline" onClick={fetchPackages}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Create Package
          </Button>
        </div>
      </div>

      {packages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {packages.map((pkg) => (
          <Card key={pkg.id} className="relative overflow-hidden hover:shadow-lg transition-shadow">
            {!pkg.is_active && (
              <div className="absolute top-0 right-0 p-2">
                <Badge className="bg-red-100 text-red-800">Inactive</Badge>
              </div>
            )}
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                   <h3 className="text-xl font-bold text-gray-900">{pkg.name}</h3>
                   <p className="text-sm text-gray-500 mt-1">{pkg.description}</p>
                </div>
              </div>
              
              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-3xl font-extrabold text-gray-900">${pkg.price_monthly}</span>
                  <span className="text-gray-500 ml-1">/mo</span>
                </div>
                 <div className="text-sm text-gray-500 mt-1">
                  or ${pkg.price_yearly}/yr
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex items-center text-sm text-gray-600">
                  <HardDrive className="w-4 h-4 mr-3 text-gray-400" />
                  {pkg.disk_quota_mb / 1024} GB Disk Space
                </div>
                 <div className="flex items-center text-sm text-gray-600">
                  <Globe className="w-4 h-4 mr-3 text-gray-400" />
                  {pkg.site_limit} Website{pkg.site_limit > 1 ? 's' : ''}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Database className="w-4 h-4 mr-3 text-gray-400" />
                  {pkg.db_limit} Database{pkg.db_limit > 1 ? 's' : ''}
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <Server className="w-4 h-4 mr-3 text-gray-400" />
                  {pkg.bandwidth_mb / 1024} GB Bandwidth
                </div>
              </div>

              <Button variant="outline" className="w-full" onClick={() => handleEdit(pkg)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Configuration
              </Button>
            </div>
          </Card>
        ))}
        </div>
      ) : (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Server className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm font-medium">No hosting packages</p>
            <p className="text-xs mt-1">Create your first package using the button above</p>
          </div>
        </Card>
      )}

      {isEditorOpen && (
        <PackageEditor
          initialData={editingPackage}
          onSave={handleSave}
          onCancel={() => setIsEditorOpen(false)}
        />
      )}
    </div>
  )
}

export default Packages

