import React from 'react'
import Button from '../ui/Button'
import { X } from 'lucide-react'

interface PackageProps {
  id?: number
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

interface PackageEditorProps {
  initialData?: PackageProps
  onSave: (data: PackageProps) => void
  onCancel: () => void
}

const PackageEditor: React.FC<PackageEditorProps> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = React.useState<PackageProps>(initialData || {
    name: '',
    description: '',
    disk_quota_mb: 1024,
    bandwidth_mb: 10240,
    db_limit: 1,
    site_limit: 1,
    price_monthly: 0,
    price_yearly: 0,
    is_active: true
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) : value
    }))
  }

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{initialData ? 'Edit Package' : 'New Package'}</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Package Name</label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Monthly Price ($)</label>
              <input
                type="number"
                name="price_monthly"
                step="0.01"
                min="0"
                value={formData.price_monthly}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Yearly Price ($)</label>
              <input
                type="number"
                name="price_yearly"
                step="0.01"
                min="0"
                value={formData.price_yearly}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Disk Quota (MB)</label>
              <input
                type="number"
                name="disk_quota_mb"
                min="0"
                value={formData.disk_quota_mb}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Bandwidth (MB)</label>
              <input
                type="number"
                name="bandwidth_mb"
                min="0"
                value={formData.bandwidth_mb}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-sm font-medium text-gray-700">Site Limit</label>
              <input
                type="number"
                name="site_limit"
                min="1"
                value={formData.site_limit}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Database Limit</label>
              <input
                type="number"
                name="db_limit"
                min="1"
                value={formData.db_limit}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
           <div className="flex items-center">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={handleCheckboxChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
              Active Package (available for new subscriptions)
            </label>
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <Button variant="outline" onClick={onCancel} type="button">Cancel</Button>
            <Button type="submit">Save Package</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PackageEditor
