import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HardDrive, Server, RefreshCw, CheckCircle, AlertCircle, Trash2, Plus, Save } from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { settingsApi } from '../services/api';
import toast from 'react-hot-toast';

const S3IntegrationCard: React.FC = () => {
    const queryClient = useQueryClient();
    const [isEditing, setIsEditing] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        name: 's3',
        provider: 'AWS',
        access_key_id: '',
        secret_access_key: '',
        region: 'us-east-1',
        endpoint: '',
    });

    // Fetch remotes
    const { data: remotesData, isLoading } = useQuery({
        queryKey: ['rclone-remotes'],
        queryFn: () => settingsApi.getRcloneRemotes(),
    });

    const configureMutation = useMutation({
        mutationFn: (data: any) => settingsApi.configureS3Remote(data),
        onSuccess: (response: any) => {
            queryClient.invalidateQueries({ queryKey: ['rclone-remotes'] });
            if (response.data.verified) {
                toast.success('S3 configured and verified!');
            } else {
                toast.success('S3 configured (verification failed check logs)');
            }
            setIsEditing(false);
            setFormData(prev => ({ ...prev, access_key_id: '', secret_access_key: '' }));
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.detail || 'Failed to configure S3');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (name: string) => settingsApi.deleteRcloneRemote(name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rclone-remotes'] });
            toast.success('Remote removed');
        },
        onError: () => toast.error('Failed to remove remote'),
    });

    // Find S3/Compatible remotes
    const s3Remotes = remotesData?.data?.remotes?.filter((r: any) => r.type === 's3') || [];

    const handleSave = () => {
        if (!formData.name || !formData.access_key_id || !formData.secret_access_key) {
            toast.error('Please fill in required fields');
            return;
        }
        configureMutation.mutate(formData);
    };

    return (
        <Card title="S3 Storage Integration">
            <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure S3-compatible storage (AWS S3, MinIO, DigitalOcean Spaces, etc.) for backups.
                </p>

                {isLoading ? (
                    <div className="flex items-center text-primary-600">
                        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        Loading remotes...
                    </div>
                ) : s3Remotes.length > 0 && !isEditing ? (
                    <div className="space-y-3">
                        {s3Remotes.map((remote: any) => (
                            <div key={remote.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                        <HardDrive className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white capitalize">{remote.name}</h4>
                                        <p className="text-xs text-gray-500">Type: {remote.type}</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className="flex items-center text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                        <CheckCircle className="w-3 h-3 mr-1" />
                                        Configured
                                    </span>
                                    <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => {
                                            if(confirm(`Remove remote '${remote.name}'?`)) {
                                                deleteMutation.mutate(remote.name);
                                            }
                                        }}
                                        disabled={deleteMutation.isPending}
                                    >
                                        <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            setFormData(prev => ({...prev, name: remote.name}));
                                            setIsEditing(true);
                                        }}
                                    >
                                        Edit
                                    </Button>
                                </div>
                            </div>
                        ))}
                        
                        <div className="pt-2">
                            <Button 
                                variant="secondary" 
                                size="sm" 
                                onClick={() => {
                                    setFormData({
                                        name: 's3-new', 
                                        provider: 'AWS', 
                                        access_key_id: '', 
                                        secret_access_key: '', 
                                        region: 'us-east-1', 
                                        endpoint: ''
                                    });
                                    setIsEditing(true);
                                }}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Another Remote
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                         {!isEditing && s3Remotes.length === 0 && (
                            <div className="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                                <HardDrive className="w-10 h-10 mx-auto text-gray-400 mb-2" />
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">No S3 Storage Configured</h3>
                                <p className="text-xs text-gray-500 mb-4">Add your S3 credentials to enable remote backups.</p>
                                <Button onClick={() => setIsEditing(true)}>
                                    Configure S3
                                </Button>
                            </div>
                        )}

                        {isEditing && (
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
                                <h3 className="font-medium text-gray-900 dark:text-white border-b pb-2">Configure S3</h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Remote Name</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({...formData, name: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                            placeholder="s3"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Unique identifier (e.g. s3, minio)</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                                        <select
                                            value={formData.provider}
                                            onChange={e => setFormData({...formData, provider: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                        >
                                            <option value="AWS">AWS S3</option>
                                            <option value="DigitalOcean">DigitalOcean Spaces</option>
                                            <option value="Minio">MinIO</option>
                                            <option value="Other">Other Compatible</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Key ID</label>
                                        <input
                                            type="text"
                                            value={formData.access_key_id}
                                            onChange={e => setFormData({...formData, access_key_id: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                            placeholder="AKIA..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secret Access Key</label>
                                        <input
                                            type="password"
                                            value={formData.secret_access_key}
                                            onChange={e => setFormData({...formData, secret_access_key: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                            placeholder="Secret key..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Region</label>
                                        <input
                                            type="text"
                                            value={formData.region}
                                            onChange={e => setFormData({...formData, region: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                            placeholder="us-east-1"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endpoint (Optional)</label>
                                        <input
                                            type="text"
                                            value={formData.endpoint}
                                            onChange={e => setFormData({...formData, endpoint: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                                            placeholder="https://s3.custom-domain.com"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Required for MinIO/Spaces</p>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <Button 
                                        variant="secondary"
                                        onClick={() => setIsEditing(false)}
                                    >
                                        Cancel
                                    </Button>
                                    <Button 
                                        variant="primary"
                                        onClick={handleSave}
                                        disabled={configureMutation.isPending}
                                    >
                                        {configureMutation.isPending ? (
                                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4 mr-2" />
                                        )}
                                        Save Configuration
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default S3IntegrationCard;
