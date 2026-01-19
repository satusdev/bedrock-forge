import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Server, Globe, Save } from 'lucide-react'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import api from '../services/api'
import toast from 'react-hot-toast'

export default function CreateProject() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  
  // State from navigation (e.g. import from CyberPanel)
  const importState = location.state || {}
  const { importFrom, server, siteData } = importState

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    site_title: '',
    admin_email: '',
    admin_user: 'admin',
    description: '',
    import_from_server_id: server?.id || null,
    import_path: '',
    is_imported: false
  })

  // Pre-fill data if importing
  useEffect(() => {
    if (importFrom === 'cyberpanel' && siteData) {
      setFormData(prev => ({
        ...prev,
        name: siteData.domain.split('.')[0], // simplified slug
        domain: siteData.domain,
        site_title: siteData.domain,
        admin_email: siteData.adminEmail,
        import_path: `/home/${siteData.domain}/public_html`,
        is_imported: true
      }))
    }
  }, [importFrom, siteData])

  const createMutation = useMutation({
    // Todo: Adjust API endpoint to support "Import" vs "Create New"
    // For now we assume a standard create endpoint that can accept "import" flags or we add a new one
    mutationFn: (data: any) => api.post('/projects', data), 
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['comprehensive-projects'] })
      toast.success('Project created successfully')
      navigate('/projects')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create project')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">
          {importFrom ? 'Import Project' : 'New Project'}
        </h1>
      </div>

      <Card>
        {importFrom && (
           <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-center">
             <Server className="w-5 h-5 text-blue-600 mr-3" />
             <div>
               <p className="text-sm font-medium text-blue-900">Importing from {server?.name} ({server?.panel_type})</p>
               <p className="text-xs text-blue-700">Site: {siteData?.domain}</p>
             </div>
           </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name (Slug)</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                required
                disabled={formData.is_imported} // Lock slug for imports? Or allow edit?
              />
              <p className="mt-1 text-xs text-gray-500">Internal ID for the project.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
              <input
                type="text"
                value={formData.domain}
                onChange={e => setFormData({...formData, domain: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Title</label>
              <input
                type="text"
                value={formData.site_title}
                onChange={e => setFormData({...formData, site_title: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
              <input
                type="email"
                value={formData.admin_email}
                onChange={e => setFormData({...formData, admin_email: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button type="submit" variant="primary" content="Create Project" disabled={createMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {importFrom ? 'Import Project' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
