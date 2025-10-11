import React, { useState } from 'react';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

interface Project {
  id: string;
  name: string;
  domain: string;
  client: string;
  server: string;
  status: 'active' | 'development' | 'maintenance' | 'error';
  last_backup: Date;
  wp_version: string;
  php_version: string;
  plugins_count: number;
  themes_count: number;
  ssl_status: 'valid' | 'expiring' | 'expired';
  disk_usage: number;
  monthly_visitors: number;
}

interface BulkOperation {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'maintenance' | 'security' | 'updates' | 'backups' | 'performance';
  requires_confirmation: boolean;
  estimated_time: string;
  impact_level: 'low' | 'medium' | 'high';
}

interface OperationTask {
  id: string;
  operation_id: string;
  project_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  result?: any;
}

interface BulkOperationsManagerProps {
  projectId: string;
}

const BulkOperationsManager: React.FC<BulkOperationsManagerProps> = ({ projectId }) => {
  const [activeTab, setActiveTab] = useState<'operations' | 'queue' | 'history' | 'templates' | 'scheduler'>('operations');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [operationName, setOperationName] = useState('');

  const [projects] = useState<Project[]>([
    {
      id: 'proj_001',
      name: 'Acme Corporate Website',
      domain: 'acme.com',
      client: 'Acme Corporation',
      server: 'web-server-01',
      status: 'active',
      last_backup: new Date('2024-09-20'),
      wp_version: '6.5.3',
      php_version: '8.1',
      plugins_count: 15,
      themes_count: 2,
      ssl_status: 'valid',
      disk_usage: 45.2,
      monthly_visitors: 12500
    },
    {
      id: 'proj_002',
      name: 'Acme Blog Platform',
      domain: 'blog.acme.com',
      client: 'Acme Corporation',
      server: 'web-server-01',
      status: 'active',
      last_backup: new Date('2024-09-19'),
      wp_version: '6.5.2',
      php_version: '8.1',
      plugins_count: 8,
      themes_count: 1,
      ssl_status: 'expiring',
      disk_usage: 23.8,
      monthly_visitors: 8500
    },
    {
      id: 'proj_003',
      name: 'Local Restaurant Website',
      domain: 'localrestaurant.com',
      client: 'Local Restaurant LLC',
      server: 'web-server-02',
      status: 'active',
      last_backup: new Date('2024-09-18'),
      wp_version: '6.4.5',
      php_version: '7.4',
      plugins_count: 12,
      themes_count: 1,
      ssl_status: 'valid',
      disk_usage: 18.5,
      monthly_visitors: 3200
    },
    {
      id: 'proj_004',
      name: 'Tech Startup Main Site',
      domain: 'startup.io',
      client: 'Tech Startup Inc',
      server: 'web-server-01',
      status: 'development',
      last_backup: new Date('2024-09-21'),
      wp_version: '6.5.3',
      php_version: '8.2',
      plugins_count: 20,
      themes_count: 3,
      ssl_status: 'valid',
      disk_usage: 67.3,
      monthly_visitors: 8900
    },
    {
      id: 'proj_005',
      name: 'Tech Startup API',
      domain: 'api.startup.io',
      client: 'Tech Startup Inc',
      server: 'web-server-02',
      status: 'development',
      last_backup: new Date('2024-09-20'),
      wp_version: '6.5.3',
      php_version: '8.2',
      plugins_count: 6,
      themes_count: 1,
      ssl_status: 'valid',
      disk_usage: 12.1,
      monthly_visitors: 1500
    },
    {
      id: 'proj_006',
      name: 'E-commerce Store',
      domain: 'shop.example.com',
      client: 'Retail Company',
      server: 'web-server-03',
      status: 'maintenance',
      last_backup: new Date('2024-09-17'),
      wp_version: '6.4.3',
      php_version: '7.4',
      plugins_count: 25,
      themes_count: 2,
      ssl_status: 'expired',
      disk_usage: 89.7,
      monthly_visitors: 25600
    }
  ]);

  const [bulkOperations] = useState<BulkOperation[]>([
    // Maintenance Operations
    {
      id: 'backup_all',
      name: 'Backup All Projects',
      description: 'Create complete backups of all selected projects',
      icon: '🗄️',
      category: 'backups',
      requires_confirmation: false,
      estimated_time: '5-15 min per project',
      impact_level: 'low'
    },
    {
      id: 'clear_caches',
      name: 'Clear All Caches',
      description: 'Clear WordPress, plugin, and server caches',
      icon: '🧹',
      category: 'performance',
      requires_confirmation: false,
      estimated_time: '1-2 min per project',
      impact_level: 'low'
    },
    {
      id: 'optimize_databases',
      name: 'Optimize Databases',
      description: 'Optimize and repair all project databases',
      icon: '⚡',
      category: 'performance',
      requires_confirmation: true,
      estimated_time: '2-5 min per project',
      impact_level: 'medium'
    },

    // Security Operations
    {
      id: 'security_scan',
      name: 'Security Scan',
      description: 'Run comprehensive security scans on all projects',
      icon: '🔒',
      category: 'security',
      requires_confirmation: false,
      estimated_time: '3-8 min per project',
      impact_level: 'low'
    },
    {
      id: 'update_all_plugins',
      name: 'Update All Plugins',
      description: 'Update all plugins across selected projects',
      icon: '🔧',
      category: 'updates',
      requires_confirmation: true,
      estimated_time: '2-10 min per project',
      impact_level: 'medium'
    },
    {
      id: 'update_themes',
      name: 'Update All Themes',
      description: 'Update all themes across selected projects',
      icon: '🎨',
      category: 'updates',
      requires_confirmation: true,
      estimated_time: '1-5 min per project',
      impact_level: 'medium'
    },
    {
      id: 'update_wp_core',
      name: 'Update WordPress Core',
      description: 'Update WordPress to latest version',
      icon: '🚀',
      category: 'updates',
      requires_confirmation: true,
      estimated_time: '3-10 min per project',
      impact_level: 'high'
    },
    {
      id: 'check_ssl',
      name: 'Check SSL Certificates',
      description: 'Verify SSL certificate status and validity',
      icon: '🔐',
      category: 'security',
      requires_confirmation: false,
      estimated_time: '30 sec per project',
      impact_level: 'low'
    },

    // Performance Operations
    {
      id: 'compress_images',
      name: 'Compress Images',
      description: 'Optimize and compress all images',
      icon: '🖼️',
      category: 'performance',
      requires_confirmation: true,
      estimated_time: '5-20 min per project',
      impact_level: 'medium'
    },
    {
      id: 'cleanup_revisions',
      name: 'Cleanup Post Revisions',
      description: 'Remove old post revisions to optimize database',
      icon: '📝',
      category: 'maintenance',
      requires_confirmation: true,
      estimated_time: '1-3 min per project',
      impact_level: 'low'
    },
    {
      id: 'cleanup_spam',
      name: 'Cleanup Spam Comments',
      description: 'Remove all spam comments and trackbacks',
      icon: '🗑️',
      category: 'maintenance',
      requires_confirmation: false,
      estimated_time: '30 sec per project',
      impact_level: 'low'
    }
  ]);

  const [operationQueue, setOperationQueue] = useState<OperationTask[]>([
    {
      id: 'task_001',
      operation_id: 'backup_all',
      project_id: 'proj_001',
      status: 'running',
      progress: 65,
      started_at: new Date(Date.now() - 5 * 60000)
    },
    {
      id: 'task_002',
      operation_id: 'backup_all',
      project_id: 'proj_002',
      status: 'pending',
      progress: 0
    },
    {
      id: 'task_003',
      operation_id: 'backup_all',
      project_id: 'proj_003',
      status: 'pending',
      progress: 0
    },
    {
      id: 'task_004',
      operation_id: 'security_scan',
      project_id: 'proj_004',
      status: 'completed',
      progress: 100,
      started_at: new Date(Date.now() - 15 * 60000),
      completed_at: new Date(Date.now() - 2 * 60000),
      result: { issues_found: 2, scan_time: '13.4 seconds' }
    },
    {
      id: 'task_005',
      operation_id: 'update_wp_core',
      project_id: 'proj_005',
      status: 'failed',
      progress: 45,
      started_at: new Date(Date.now() - 30 * 60000),
      error_message: 'Plugin compatibility issue detected. Update cancelled.'
    }
  ]);

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'development': return 'bg-blue-100 text-blue-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSSLStatusColor = (status: Project['ssl_status']) => {
    switch (status) {
      case 'valid': return 'bg-green-100 text-green-800';
      case 'expiring': return 'bg-yellow-100 text-yellow-800';
      case 'expired': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTaskStatusColor = (status: OperationTask['status']) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getImpactLevelColor = (level: BulkOperation['impact_level']) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleProjectSelection = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const handleSelectAll = () => {
    if (selectedProjects.length === projects.length) {
      setSelectedProjects([]);
    } else {
      setSelectedProjects(projects.map(p => p.id));
    }
  };

  const handleStartOperation = (operationId: string) => {
    if (selectedProjects.length === 0) return;

    const operation = bulkOperations.find(op => op.id === operationId);
    if (operation?.requires_confirmation) {
      setCurrentOperation(operationId);
      setOperationName(operation.name);
      setShowConfirmation(true);
    } else {
      // Start operation immediately
      startOperation(operationId);
    }
  };

  const startOperation = (operationId: string) => {
    // Add tasks to queue
    const newTasks = selectedProjects.map(projectId => ({
      id: `task_${Date.now()}_${projectId}`,
      operation_id: operationId,
      project_id: projectId,
      status: 'pending' as const,
      progress: 0
    }));

    setOperationQueue(prev => [...prev, ...newTasks]);
    setShowConfirmation(false);
    setCurrentOperation(null);
    setOperationName('');
  };

  const OperationsTab = () => (
    <div className="space-y-6">
      {/* Project Selection */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Select Projects</h3>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {selectedProjects.length} of {projects.length} selected
              </span>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedProjects.length === projects.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedProjects.includes(project.id)
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleProjectSelection(project.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={selectedProjects.includes(project.id)}
                      onChange={() => handleProjectSelection(project.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <h4 className="font-medium text-gray-900">{project.name}</h4>
                      <p className="text-sm text-gray-500">{project.domain}</p>
                    </div>
                  </div>
                  <Badge className={getStatusColor(project.status)}>
                    {project.status}
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-gray-600">
                  <div className="flex justify-between">
                    <span>Client:</span>
                    <span>{project.client}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Server:</span>
                    <span>{project.server}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>WordPress:</span>
                    <span>{project.wp_version}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>SSL:</span>
                    <Badge className={getSSLStatusColor(project.ssl_status)}>
                      {project.ssl_status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Available Operations */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Available Operations</h3>

          <div className="space-y-6">
            {['maintenance', 'security', 'updates', 'performance', 'backups'].map((category) => {
              const categoryOperations = bulkOperations.filter(op => op.category === category);
              if (categoryOperations.length === 0) return null;

              return (
                <div key={category}>
                  <h4 className="font-medium text-gray-900 mb-3 capitalize">{category} Operations</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryOperations.map((operation) => (
                      <div key={operation.id} className="border rounded-lg p-4">
                        <div className="flex items-start space-x-3">
                          <div className="text-2xl">{operation.icon}</div>
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{operation.name}</h5>
                            <p className="text-sm text-gray-600 mb-3">{operation.description}</p>

                            <div className="space-y-2 mb-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Impact:</span>
                                <Badge className={getImpactLevelColor(operation.impact_level)}>
                                  {operation.impact_level}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Time:</span>
                                <span className="text-gray-700">{operation.estimated_time}</span>
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full"
                              disabled={selectedProjects.length === 0}
                              onClick={() => handleStartOperation(operation.id)}
                            >
                              {operation.requires_confirmation ? 'Configure & Run' : 'Run Now'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );

  const QueueTab = () => {
    const runningTasks = operationQueue.filter(t => t.status === 'running');
    const pendingTasks = operationQueue.filter(t => t.status === 'pending');
    const completedTasks = operationQueue.filter(t => t.status === 'completed');
    const failedTasks = operationQueue.filter(t => t.status === 'failed');

    return (
      <div className="space-y-6">
        {/* Queue Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <div className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">Running</p>
                <p className="text-2xl font-bold text-blue-600">{runningTasks.length}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingTasks.length}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedTasks.length}</p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <div className="text-center">
                <p className="text-sm text-gray-600">Failed</p>
                <p className="text-2xl font-bold text-red-600">{failedTasks.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Active Tasks */}
        {(runningTasks.length > 0 || pendingTasks.length > 0) && (
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Active Tasks</h3>
              <div className="space-y-4">
                {[...runningTasks, ...pendingTasks].map((task) => {
                  const operation = bulkOperations.find(op => op.id === task.operation_id);
                  const project = projects.find(p => p.id === task.project_id);

                  return (
                    <div key={task.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium text-gray-900">{operation?.name}</h4>
                          <p className="text-sm text-gray-600">{project?.name} - {project?.domain}</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <Badge className={getTaskStatusColor(task.status)}>
                            {task.status}
                          </Badge>
                          {task.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setOperationQueue(prev =>
                                  prev.map(t =>
                                    t.id === task.id
                                      ? { ...t, status: 'cancelled' as const }
                                      : t
                                  )
                                );
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>

                      {task.status === 'running' && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Progress</span>
                            <span className="text-gray-900">{task.progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          {task.started_at && (
                            <p className="text-xs text-gray-500">
                              Started: {task.started_at.toLocaleTimeString()}
                            </p>
                          )}
                        </div>
                      )}

                      {task.status === 'failed' && task.error_message && (
                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-800">{task.error_message}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* Completed Tasks */}
        {completedTasks.length > 0 && (
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Completed Tasks</h3>
              <div className="space-y-3">
                {completedTasks.map((task) => {
                  const operation = bulkOperations.find(op => op.id === task.operation_id);
                  const project = projects.find(p => p.id === task.project_id);

                  return (
                    <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{operation?.name}</p>
                        <p className="text-sm text-gray-600">{project?.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-green-600">Completed</p>
                        {task.completed_at && (
                          <p className="text-xs text-gray-500">
                            {task.completed_at.toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}
      </div>
    );
  };

  const HistoryTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Operation History</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Security Scan Completed</p>
                  <p className="text-sm text-gray-600">6 projects scanned successfully</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">2 hours ago</p>
                <p className="text-xs text-gray-500">Duration: 8m 34s</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-green-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">All Plugins Updated</p>
                  <p className="text-sm text-gray-600">45 plugins updated across 4 projects</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">Yesterday</p>
                <p className="text-xs text-gray-500">Duration: 23m 12s</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Complete Backup Created</p>
                  <p className="text-sm text-gray-600">Full backups for all 6 projects</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">2 days ago</p>
                <p className="text-xs text-gray-500">Duration: 45m 18s</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="bg-red-100 p-2 rounded-lg">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">WordPress Core Update Failed</p>
                  <p className="text-sm text-gray-600">Failed on 1 project due to compatibility</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-900">3 days ago</p>
                <p className="text-xs text-gray-500">Duration: 6m 42s</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const TemplatesTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Operation Templates</h3>
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Template
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Weekly Maintenance</h4>
              <p className="text-sm text-gray-600 mb-4">Runs every Sunday at 2:00 AM</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Clear all caches
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cleanup spam comments
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Optimize databases
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Last run: 2 days ago</span>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Monthly Security</h4>
              <p className="text-sm text-gray-600 mb-4">Runs on the 1st of each month</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Security scan
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Check SSL certificates
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Update WordPress core
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Last run: 15 days ago</span>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Daily Backup</h4>
              <p className="text-sm text-gray-600 mb-4">Runs every day at 1:00 AM</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Complete backup
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Upload to Google Drive
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cleanup old backups
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Last run: 5 hours ago</span>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Performance Optimization</h4>
              <p className="text-sm text-gray-600 mb-4">Runs weekly on Fridays</p>
              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Compress images
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cleanup revisions
                </div>
                <div className="flex items-center text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Clear caches
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Last run: 1 week ago</span>
                <Button variant="outline" size="sm">Edit</Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const SchedulerTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Scheduled Operations</h3>
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Schedule Operation
            </Button>
          </div>

          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">Daily Backups</h4>
                  <p className="text-sm text-gray-600">All projects • Every day at 1:00 AM</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Next run: Tomorrow at 1:00 AM
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">Weekly Security Scan</h4>
                  <p className="text-sm text-gray-600">Production projects • Sundays at 3:00 AM</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Next run: In 3 days at 3:00 AM
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">Monthly Updates</h4>
                  <p className="text-sm text-gray-600">All projects • 1st of each month at 2:00 AM</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-green-100 text-green-800">Active</Badge>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Next run: In 10 days at 2:00 AM
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-medium text-gray-900">Cache Cleanup</h4>
                  <p className="text-sm text-gray-600">High-traffic projects • Every 6 hours</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge className="bg-gray-100 text-gray-800">Paused</Badge>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
              </div>
              <div className="text-sm text-gray-600">
                Paused by admin on Sep 15, 2024
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Schedule Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Default Maintenance Window</label>
              <div className="flex space-x-2">
                <input
                  type="time"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  defaultValue="02:00"
                />
                <span className="flex items-center text-sm text-gray-500">to</span>
                <input
                  type="time"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  defaultValue="04:00"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Concurrent Operations</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                defaultValue="3"
                min="1"
                max="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Failure Notification</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Immediately</option>
                <option>After 3 failures</option>
                <option>Daily summary</option>
                <option>Weekly summary</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Retry Failed Operations</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option>Automatically (3 attempts)</option>
                <option>Manually only</option>
                <option>Never retry</option>
              </select>
            </div>
          </div>
          <div className="mt-6">
            <Button>Save Configuration</Button>
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
          <h2 className="text-2xl font-bold text-gray-900">Bulk Operations Manager</h2>
          <p className="text-gray-600">Execute and manage operations across multiple projects</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="outline">Export Logs</Button>
          <Button>Quick Actions</Button>
        </div>
      </div>

      {/* Status Alert */}
      {operationQueue.filter(t => t.status === 'running' || t.status === 'pending').length > 0 && (
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-blue-800">
                {operationQueue.filter(t => t.status === 'running').length} operations running, {operationQueue.filter(t => t.status === 'pending').length} pending
              </p>
              <p className="text-sm text-blue-600">
                Operations are being processed in the background
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('queue')}
            >
              View Queue
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'operations', label: 'Operations' },
            { key: 'queue', label: 'Queue' },
            { key: 'history', label: 'History' },
            { key: 'templates', label: 'Templates' },
            { key: 'scheduler', label: 'Scheduler' }
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
              {tab.key === 'queue' && operationQueue.filter(t => t.status === 'running' || t.status === 'pending').length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                  {operationQueue.filter(t => t.status === 'running' || t.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'operations' && <OperationsTab />}
      {activeTab === 'queue' && <QueueTab />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'scheduler' && <SchedulerTab />}

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Confirm Operation</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Operation:</p>
                <p className="font-medium">{operationName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-2">Projects affected:</p>
                <p className="font-medium">{selectedProjects.length} projects</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  This operation may temporarily affect the performance of the selected projects.
                  It's recommended to run during off-peak hours.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                Cancel
              </Button>
              <Button onClick={() => startOperation(currentOperation!)}>
                Confirm & Run
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkOperationsManager;