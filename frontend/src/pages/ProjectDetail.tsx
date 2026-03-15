/**
 * Project Detail Page
 * Full project view with tabs for Overview, Environments, Plugins, Backups, Git.
 */
import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from '@/router/compat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	ArrowLeftRight,
	ArrowRight,
	Archive,
	AlertTriangle,
	Globe,
	Github,
	Cloud,
	Download,
	ExternalLink,
	GitBranch,
	Package,
	Plus,
	RefreshCw,
	RotateCcw,
	Server,
	Settings,
	Trash2,
	Clock,
	CheckCircle,
	XCircle,
	Shield,
	AlertCircle,
	Pencil,
	Terminal,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import LinkEnvironmentModal from '../components/LinkEnvironmentModal';
import EditEnvironmentModal from '../components/EditEnvironmentModal';
import SyncModal from '../components/SyncModal';
import BackupSchedulePanel from '../components/BackupSchedulePanel';
import { dashboardApi, getApiErrorMessage } from '../services/api';
import toast from 'react-hot-toast';
import TaskLogModal from '../components/TaskLogModal';
import { useTaskStatusPolling } from '../hooks/useTaskStatusPolling';
import websocketService, { WebSocketMessage } from '@/services/websocket';

type TabId =
	| 'overview'
	| 'environments'
	| 'plugins'
	| 'backups'
	| 'restore'
	| 'git'
	| 'security';

// Security Scan Result Types
interface SecurityCheck {
	name: string;
	status: 'pass' | 'warn' | 'fail';
	message: string;
	severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
	details?: Record<string, any>;
}

interface SecurityScanResult {
	project_id: number;
	project_name: string;
	scanned_at: string;
	overall_status: 'pass' | 'warn' | 'fail';
	score: number;
	checks: SecurityCheck[];
	summary: { pass: number; warn: number; fail: number };
}

interface Environment {
	id: number;
	environment: 'staging' | 'production' | 'development';
	server_id: number;
	server_name: string;
	server_hostname: string;
	wp_url: string;
	wp_path: string;
	notes: string | null;
	is_primary: boolean;
	created_at: string;
	updated_at: string;
}

export default function ProjectDetail() {
	const { projectName } = useParams<{ projectName: string }>();
	const [activeTab, setActiveTab] = useState<TabId>('overview');
	const [showLinkModal, setShowLinkModal] = useState(false);
	const [showSyncModal, setShowSyncModal] = useState(false);
	const [syncSource, setSyncSource] = useState<Environment | null>(null);
	const [syncDirection, setSyncDirection] = useState<'push' | 'pull'>('push');

	// Backup and Security Env Selection
	const [backupEnvId, setBackupEnvId] = useState<string>('');
	const [securityEnvId, setSecurityEnvId] = useState<string>('');
	const [restoreEnvId, setRestoreEnvId] = useState<string>('');
	const [backupType, setBackupType] = useState<'database' | 'files' | 'full'>(
		'database',
	);
	const [storageType, setStorageType] = useState<'gdrive' | 'local' | 'both'>(
		'gdrive',
	);

	// WP-CLI Runner State
	const [runnerEnvId, setRunnerEnvId] = useState<string>('');
	const [runnerCommand, setRunnerCommand] = useState<string>('plugin list');
	const [runnerArgs, setRunnerArgs] = useState<string>('');
	const [runnerTaskId, setRunnerTaskId] = useState<string | null>(null);
	const [runnerStatus, setRunnerStatus] = useState<any>(null);
	const [wsConnected, setWsConnected] = useState(false);

	const [globalPolicyForm, setGlobalPolicyForm] = useState({
		name: 'Default Policy',
		allowed: '',
		required: '',
		blocked: '',
		pinned: '',
		notes: '',
	});
	const [projectPolicyForm, setProjectPolicyForm] = useState({
		inherit_default: true,
		allowed: '',
		required: '',
		blocked: '',
		pinned: '',
		notes: '',
	});
	const [selectedBundleId, setSelectedBundleId] = useState<string>('');

	const allowedWpCommands = [
		'core version',
		'core check-update',
		'core update',
		'plugin list',
		'plugin status',
		'plugin update',
		'theme list',
		'theme status',
		'theme update',
		'user list',
		'option get',
		'cache flush',
	];

	// Logs Modal State
	const [logModal, setLogModal] = useState<{
		isOpen: boolean;
		backupId: number;
		backupName: string;
		isRunning: boolean;
	}>({
		isOpen: false,
		backupId: 0,
		backupName: '',
		isRunning: false,
	});

	// Edit Environment State
	const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
	const [showEditEnvModal, setShowEditEnvModal] = useState(false);

	const queryClient = useQueryClient();

	// Fetch project (for now using comprehensive, later should fetch by ID)
	const { data: projectData, isLoading } = useQuery({
		queryKey: ['project', projectName],
		queryFn: () => dashboardApi.getComprehensiveProjects(),
	});

	const project = (projectData?.data as any[])?.find(
		p => p.project_name === projectName || p.slug === projectName,
	);
	const projectId = project?.id;

	// Fetch environments
	const { data: envData, isLoading: envLoading } = useQuery({
		queryKey: ['project-environments', projectId],
		queryFn: () => dashboardApi.getProjectEnvironments(projectId),
		enabled: !!projectId,
	});
	const environments = (envData?.data || []) as Environment[];

	useEffect(() => {
		if (!runnerEnvId && environments.length > 0) {
			setRunnerEnvId(String(environments[0].id));
		}
	}, [environments, runnerEnvId]);

	// Fetch Drive settings
	const { data: driveData } = useQuery({
		queryKey: ['project-drive', projectId],
		queryFn: () => dashboardApi.getProjectDriveSettings(projectId),
		enabled: !!projectId,
	});
	const driveSettings = driveData?.data;

	// Drive backup index
	const { data: driveIndexData } = useQuery({
		queryKey: ['project-drive-backups-index', projectId],
		queryFn: () => dashboardApi.getProjectDriveBackupIndex(projectId),
		enabled: !!projectId,
	});

	const [backupsPage, setBackupsPage] = useState(1);
	const backupsPageSize = 10;
	const [selectedBackupIds, setSelectedBackupIds] = useState<number[]>([]);

	// Fallback to DB backups if Drive index fails or is empty
	const { data: dbBackupsData } = useQuery({
		queryKey: ['project-backups', projectId, backupsPage, backupsPageSize],
		queryFn: () =>
			dashboardApi.getProjectBackups(projectId, backupsPage, backupsPageSize),
		enabled: !!projectId,
		keepPreviousData: true,
		refetchInterval: response => {
			if (wsConnected) {
				return false;
			}
			const payload = response?.data as
				| { items?: Array<{ status?: string }> }
				| undefined;
			const items = Array.isArray(payload?.items) ? payload.items : [];
			const hasActive = items.some(backup => {
				const status = String(backup.status || '').toLowerCase();
				return (
					status === 'pending' ||
					status === 'running' ||
					status === 'in_progress'
				);
			});
			return hasActive ? 5000 : false;
		},
	});

	useEffect(() => {
		if (!projectId) {
			return;
		}

		const handleConnection = (message: WebSocketMessage) => {
			if (message.type !== 'connection') {
				return;
			}
			setWsConnected(message.status === 'connected');
		};

		const handleBackupUpdate = (message: WebSocketMessage) => {
			if (message.type !== 'backup_update') {
				return;
			}
			if (Number((message as any).project_id) !== projectId) {
				return;
			}

			queryClient.invalidateQueries({
				queryKey: ['project-backups', projectId, backupsPage, backupsPageSize],
			});
			queryClient.invalidateQueries({
				queryKey: ['project-drive-backups-index', projectId],
			});
		};

		websocketService.on('connection', handleConnection);
		websocketService.on('backup_update', handleBackupUpdate);
		void websocketService.connect().then(() => {
			setWsConnected(websocketService.isConnected());
		});

		return () => {
			websocketService.off('connection', handleConnection);
			websocketService.off('backup_update', handleBackupUpdate);
		};
	}, [projectId, backupsPage, backupsPageSize, queryClient]);

	// Drive settings state
	const [driveForm, setDriveForm] = useState({
		gdrive_backups_folder_id: '',
		gdrive_assets_folder_id: '',
		gdrive_docs_folder_id: '',
	});
	const [showDriveForm, setShowDriveForm] = useState(false);

	// Fetch plugins
	const { data: pluginsData } = useQuery({
		queryKey: ['plugins', projectName],
		queryFn: () => dashboardApi.getProjectPlugins(projectName!),
		enabled: !!projectName && activeTab === 'plugins',
	});

	const { data: globalPolicyData } = useQuery({
		queryKey: ['plugin-policy-global'],
		queryFn: () => dashboardApi.getGlobalPluginPolicy(),
		enabled: activeTab === 'plugins',
	});

	const { data: projectPolicyData } = useQuery({
		queryKey: ['plugin-policy-project', projectId],
		queryFn: async () => {
			if (!projectId) return null;
			try {
				return await dashboardApi.getProjectPluginPolicy(projectId);
			} catch (error: any) {
				if (error?.response?.status === 404) {
					return null;
				}
				throw error;
			}
		},
		enabled: !!projectId && activeTab === 'plugins',
	});

	useEffect(() => {
		const policy = globalPolicyData?.data;
		if (!policy) return;
		setGlobalPolicyForm(prev => ({
			...prev,
			name: policy.name || 'Default Policy',
			allowed: listToText(policy.allowed_plugins),
			required: listToText(policy.required_plugins),
			blocked: listToText(policy.blocked_plugins),
			pinned: pinnedToText(policy.pinned_versions),
			notes: policy.notes || '',
		}));
	}, [globalPolicyData]);

	useEffect(() => {
		const policy = projectPolicyData?.data;
		if (!policy) return;
		setProjectPolicyForm(prev => ({
			...prev,
			inherit_default: policy.inherit_default ?? true,
			allowed: listToText(policy.allowed_plugins),
			required: listToText(policy.required_plugins),
			blocked: listToText(policy.blocked_plugins),
			pinned: pinnedToText(policy.pinned_versions),
			notes: policy.notes || '',
		}));
	}, [projectPolicyData]);

	const { data: effectivePolicyData } = useQuery({
		queryKey: ['plugin-policy-effective', projectId],
		queryFn: () => dashboardApi.getEffectivePluginPolicy(projectId!),
		enabled: !!projectId && activeTab === 'plugins',
	});

	const { data: pluginBundlesData } = useQuery({
		queryKey: ['plugin-policy-bundles'],
		queryFn: () => dashboardApi.getPluginBundles(),
		enabled: activeTab === 'plugins',
	});

	const { data: pluginDriftData } = useQuery({
		queryKey: ['plugin-drift', runnerEnvId],
		queryFn: () => dashboardApi.getPluginDrift(Number(runnerEnvId)),
		enabled: !!runnerEnvId && activeTab === 'plugins',
	});

	const { data: wpCliHistory } = useQuery({
		queryKey: ['wp-cli-history', runnerEnvId],
		queryFn: () =>
			dashboardApi.getAuditLogs({
				limit: 10,
				action: 'command',
				entity_type: 'wp_cli',
				entity_id: runnerEnvId || undefined,
			}),
		enabled: !!runnerEnvId && activeTab === 'plugins',
	});

	const runWpCliMutation = useMutation({
		mutationFn: () =>
			dashboardApi.runWpCliCommand({
				project_server_id: Number(runnerEnvId),
				command: runnerCommand,
				args: runnerArgs.trim().split(/\s+/).filter(Boolean),
			}),
		onSuccess: response => {
			setRunnerTaskId(response.data.task_id);
			setRunnerStatus({ status: 'pending', message: 'Queued' });
			queryClient.invalidateQueries({
				queryKey: ['wp-cli-history', runnerEnvId],
			});
			toast.success('WP-CLI command queued');
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'Failed to queue WP-CLI command'));
		},
	});

	// Action mutations
	const actionMutation = useMutation({
		mutationFn: ({ action }: { action: string }) =>
			dashboardApi.executeProjectAction(projectName!, action),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project', projectName] });
			toast.success('Action executed successfully');
		},
		onError: () => toast.error('Action failed'),
	});

	// Unlink environment mutation
	const unlinkMutation = useMutation({
		mutationFn: (envId: number) =>
			dashboardApi.unlinkEnvironment(projectId, envId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['project-environments', projectId],
			});
			toast.success('Environment unlinked');
		},
		onError: () => toast.error('Failed to unlink environment'),
	});

	// Backup creation mutation

	const runWpCliDirectMutation = useMutation({
		mutationFn: ({ command, args }: { command: string; args: string[] }) =>
			dashboardApi.runWpCliCommand({
				project_server_id: Number(runnerEnvId),
				command,
				args,
			}),
		onSuccess: response => {
			setRunnerTaskId(response.data.task_id);
			setRunnerStatus({ status: 'pending', message: 'Queued' });
			queryClient.invalidateQueries({
				queryKey: ['wp-cli-history', runnerEnvId],
			});
			toast.success('WP-CLI command queued');
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'Failed to queue WP-CLI command'));
		},
	});

	const saveGlobalPolicyMutation = useMutation({
		mutationFn: () =>
			dashboardApi.updateGlobalPluginPolicy({
				name: globalPolicyForm.name,
				allowed_plugins: textToList(globalPolicyForm.allowed),
				required_plugins: textToList(globalPolicyForm.required),
				blocked_plugins: textToList(globalPolicyForm.blocked),
				pinned_versions: textToPinned(globalPolicyForm.pinned),
				notes: globalPolicyForm.notes || undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['plugin-policy-global'] });
			queryClient.invalidateQueries({
				queryKey: ['plugin-policy-effective', projectId],
			});
			toast.success('Global policy updated');
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'Failed to update global policy'));
		},
	});

	const saveProjectPolicyMutation = useMutation({
		mutationFn: () =>
			dashboardApi.updateProjectPluginPolicy(projectId!, {
				inherit_default: projectPolicyForm.inherit_default,
				allowed_plugins: textToList(projectPolicyForm.allowed),
				required_plugins: textToList(projectPolicyForm.required),
				blocked_plugins: textToList(projectPolicyForm.blocked),
				pinned_versions: textToPinned(projectPolicyForm.pinned),
				notes: projectPolicyForm.notes || undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['plugin-policy-project', projectId],
			});
			queryClient.invalidateQueries({
				queryKey: ['plugin-policy-effective', projectId],
			});
			toast.success('Project policy updated');
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'Failed to update project policy'));
		},
	});

	const applyBundleToGlobalMutation = useMutation({
		mutationFn: () => dashboardApi.applyBundleToGlobalPolicy(selectedBundleId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['plugin-policy-global'] });
			queryClient.invalidateQueries({
				queryKey: ['plugin-policy-effective', projectId],
			});
			toast.success('Bundle applied to global policy');
		},
		onError: (error: any) => {
			toast.error(
				getApiErrorMessage(error, 'Failed to apply bundle to global policy'),
			);
		},
	});

	const applyBundleToProjectMutation = useMutation({
		mutationFn: () =>
			dashboardApi.applyBundleToProjectPolicy(projectId!, selectedBundleId),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ['plugin-policy-project', projectId],
			});
			queryClient.invalidateQueries({
				queryKey: ['plugin-policy-effective', projectId],
			});
			toast.success('Bundle applied to project policy');
		},
		onError: (error: any) => {
			toast.error(
				getApiErrorMessage(error, 'Failed to apply bundle to project policy'),
			);
		},
	});
	const createBackupMutation = useMutation({
		mutationFn: (data: { envId: number; type: string; storage: string }) =>
			dashboardApi.createEnvironmentBackup(
				projectId!,
				data.envId,
				data.type,
				data.storage,
			),
		onSuccess: () => {
			toast.success('Backup started');
			// Invalidate both standard backups and drive index
			queryClient.invalidateQueries({
				queryKey: ['project-backups', projectId],
			});
			queryClient.invalidateQueries({
				queryKey: ['project-drive-backups-index', projectId],
			});
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'Backup failed to start'));
		},
	});

	// Delete backup mutation
	const deleteBackupMutation = useMutation({
		mutationFn: (data: {
			backupId: number;
			force?: boolean;
			deleteFile?: boolean;
		}) =>
			dashboardApi.deleteBackup(data.backupId, {
				force: data.force,
				delete_file: data.deleteFile,
			}),
		onSuccess: () => {
			toast.success('Backup deleted');
			queryClient.invalidateQueries({
				queryKey: ['project-backups', projectId],
			});
			queryClient.invalidateQueries({
				queryKey: ['project-drive-backups-index', projectId],
			});
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'Failed to delete backup'));
		},
	});

	const bulkDeleteBackupsMutation = useMutation({
		mutationFn: (data: { backupIds: number[]; force?: boolean }) =>
			dashboardApi.bulkDeleteBackups(data.backupIds, data.force),
		onSuccess: () => {
			toast.success('Selected backups deleted');
			setSelectedBackupIds([]);
			queryClient.invalidateQueries({
				queryKey: ['project-backups', projectId],
			});
			queryClient.invalidateQueries({
				queryKey: ['project-drive-backups-index', projectId],
			});
		},
		onError: (error: any) => {
			toast.error(
				getApiErrorMessage(error, 'Failed to delete selected backups'),
			);
		},
	});

	const refreshWhoisMutation = useMutation({
		mutationFn: () => dashboardApi.refreshProjectWhois(projectId as number),
		onSuccess: () => {
			toast.success('WHOIS refreshed');
		},
		onError: (error: any) => {
			toast.error(getApiErrorMessage(error, 'WHOIS refresh failed'));
		},
	});

	// Drive settings mutation
	const driveMutation = useMutation({
		mutationFn: (settings: any) =>
			dashboardApi.updateProjectDriveSettings(projectId, settings),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['project-drive', projectId] });
			toast.success('Drive settings saved');
			setShowDriveForm(false);
		},
		onError: () => toast.error('Failed to save Drive settings'),
	});

	// Security scan state
	const [securityScanResult, setSecurityScanResult] =
		useState<SecurityScanResult | null>(null);
	const [isScanning, setIsScanning] = useState(false);

	// Drive clone state
	const [driveEnv, setDriveEnv] = useState('');
	const [driveTimestamp, setDriveTimestamp] = useState('');
	const [targetEnvId, setTargetEnvId] = useState<number | ''>('');
	const [driveSourceUrl, setDriveSourceUrl] = useState('');
	const [driveTargetDomain, setDriveTargetDomain] = useState('');
	const [setShellUser, setSetShellUser] = useState('');
	const [runComposerInstall, setRunComposerInstall] = useState(true);
	const [runComposerUpdate, setRunComposerUpdate] = useState(false);
	const [runWpPluginUpdate, setRunWpPluginUpdate] = useState(false);
	const [driveCloneTaskId, setDriveCloneTaskId] = useState<string | null>(null);
	const [driveCloneStatus, setDriveCloneStatus] = useState<any>(null);

	// Restore wizard state
	const [restoreStep, setRestoreStep] = useState<1 | 2 | 3>(1);
	const [selectedBackup, setSelectedBackup] = useState<any>(null);

	// Security scan mutation
	const runSecurityScan = async () => {
		if (!projectId || !securityEnvId) {
			toast.error('Please select an environment to scan');
			return;
		}
		setIsScanning(true);
		try {
			// Use dashboardApi which includes the new scanEnvironment method
			const response = await dashboardApi.scanEnvironment(
				projectId,
				Number(securityEnvId),
			);
			setSecurityScanResult(response.data);
			toast.success('Security scan completed');
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Security scan failed');
		} finally {
			setIsScanning(false);
		}
	};

	// Composer update state and handler
	const [isUpdatingComposer, setIsUpdatingComposer] = useState(false);

	const runComposerUpdateTask = async () => {
		if (!projectName) return;
		setIsUpdatingComposer(true);
		try {
			const response = await dashboardApi.runComposerUpdate(projectName);
			if (response.data.status === 'success') {
				toast.success(
					`Composer update completed! ${
						response.data.packages_updated || 0
					} packages updated.`,
				);
			} else {
				toast.error(response.data.message || 'Composer update failed');
			}
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Composer update failed');
		} finally {
			setIsUpdatingComposer(false);
		}
	};

	// Unified backup index (Drive + DB Fallback)
	const driveIndexRaw = driveIndexData?.data?.environments || {};

	// If Drive index is empty, try to populate from DB backups
	// If Drive index is empty, try to populate from DB backups
	const unifiedIndex = useMemo(() => {
		// Deep copy the existing arrays to avoid mutating the React Query cache
		const index: Record<string, any[]> = {};
		Object.keys(driveIndexRaw).forEach(key => {
			index[key] = [...driveIndexRaw[key]];
		});

		// Fallback/Merge with DB backups
		if (dbBackupsData?.data?.items) {
			dbBackupsData.data.items.forEach((backup: any) => {
				// Infer environment from name or fallback to 'unknown'
				// Typical name: "Backup STAGING - 2024..."
				let envName = 'production'; // Default?
				const lowerName = backup.name.toLowerCase();
				if (lowerName.includes('staging')) envName = 'staging';
				else if (lowerName.includes('prod')) envName = 'production';
				else if (lowerName.includes('dev')) envName = 'development';

				if (!index[envName]) index[envName] = [];

				// Deduplicate based on timestamp/ID to prevent adding the same DB backup multiple times
				// if useMemo re-runs. Since we copy fresh from driveIndexRaw and then loop over DB data,
				// the only risk is if DB data has dupes or if we mutated the cache (which we fixed above).
				// We can add a simple check to be safe against mixed sources having same backup.
				const exists = index[envName].some(
					b =>
						(b.id && b.id === backup.id) || b.timestamp === backup.created_at,
				);

				if (!exists) {
					index[envName].push({
						timestamp: backup.created_at,
						type: backup.backup_type,
						size: backup.size_bytes
							? `${(backup.size_bytes / 1024 / 1024).toFixed(2)} MB`
							: 'Unknown',
						id: backup.id,
						is_db_record: true, // Flag to know source
						storage_type: backup.storage_type, // 'local', 'gdrive', etc.
					});
				}
			});
		}

		// Sort all environments by timestamp desc
		Object.keys(index).forEach(env => {
			index[env].sort((a, b) => {
				// Handle different timestamp formats if needed, but simple string sort desc usually works for ISO and YYYYMMDD
				return (b.timestamp || '').localeCompare(a.timestamp || '');
			});
		});

		return index;
	}, [driveIndexRaw, dbBackupsData]);

	// Use unifiedIndex instead of driveIndexRaw
	const driveIndex = unifiedIndex;

	const parseDomain = (url: string) => {
		try {
			return new URL(url).hostname;
		} catch {
			return url.replace(/^https?:\/\//, '').split('/')[0];
		}
	};

	const parseAuditDetails = (details?: string) => {
		if (!details) return null;
		try {
			return JSON.parse(details);
		} catch {
			return null;
		}
	};

	const listToText = (list?: string[]) => (list || []).join('\n');
	const textToList = (value: string) =>
		value
			.split(/[\n,]+/)
			.map(item => item.trim())
			.filter(Boolean);
	const pinnedToText = (pinned?: Record<string, string>) =>
		Object.entries(pinned || {})
			.map(([slug, version]) => `${slug}=${version}`)
			.join('\n');
	const textToPinned = (value: string) => {
		const output: Record<string, string> = {};
		value
			.split(/[\n,]+/)
			.map(item => item.trim())
			.filter(Boolean)
			.forEach(item => {
				const [slug, version] = item.split('=');
				if (slug && version) {
					output[slug.trim()] = version.trim();
				}
			});
		return output;
	};

	const formatBackupTimestamp = (ts: string) => {
		if (!ts) return '';
		// If it looks like an ISO date (from DB)
		if (ts.includes('T') || ts.includes('+')) {
			try {
				return new Date(ts).toLocaleString();
			} catch (e) {
				return ts;
			}
		}
		// If it looks like a folder name (YYYYMMDD-HHMMSS)
		// Leave as is or format if needed
		return ts;
	};

	// Helper component for Environment Status Card (Plugins Tab)
	const EnvStatusCard = ({ env, colors, onClick }: any) => {
		const { data: wpState, isLoading: wpLoading } = useQuery({
			queryKey: ['wp-state', env.id],
			queryFn: () => dashboardApi.getWpSiteState(env.id),
			retry: false,
			refetchOnWindowFocus: false,
		});

		return (
			<div key={env.id} className='cursor-pointer' onClick={onClick}>
				<Card
					className={`border-2 ${colors.border} hover:shadow-lg transition-all duration-200`}
				>
					<div className='space-y-4'>
						{/* Header */}
						<div className='flex items-start justify-between'>
							<div>
								<div
									className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text}`}
								>
									{colors.icon} {env.environment.toUpperCase()}
								</div>
								<p className='mt-2 text-sm text-gray-500'>{env.server_name}</p>
							</div>
							<Package className='w-6 h-6 text-gray-400' />
						</div>

						{/* Quick Stats */}
						<div className='grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg'>
							<div className='text-center'>
								<div className='text-2xl font-bold text-gray-900'>
									{wpLoading ? '...' : (wpState?.data?.plugins_count ?? '--')}
								</div>
								<div className='text-xs text-gray-500'>Plugins</div>
							</div>
							<div className='text-center'>
								<div className='text-2xl font-bold text-gray-900'>
									{wpLoading ? '...' : (wpState?.data?.themes_count ?? '--')}
								</div>
								<div className='text-xs text-gray-500'>Themes</div>
							</div>
						</div>

						{/* Action */}
						<div className='flex items-center justify-between pt-2 border-t'>
							<span className='text-xs text-gray-400'>
								{wpState?.data?.scan_error ? (
									<span
										className='text-red-500 flex items-center'
										title={wpState.data.scan_error}
									>
										<AlertTriangle className='w-3 h-3 mr-1' />
										Scan Error
									</span>
								) : wpState?.data?.last_scanned_at ? (
									`Scanned: ${new Date(
										wpState.data.last_scanned_at,
									).toLocaleDateString()}`
								) : (
									'Click to scan & view details'
								)}
							</span>
							<Button
								variant='secondary'
								size='sm'
								onClick={e => {
									e.stopPropagation();
									// Trigger WP scan
									dashboardApi
										.scanWpSite(env.id)
										.then(() => {
											toast.success('Scan started');
										})
										.catch(() => {
											toast.error('Scan failed to start');
										});
								}}
							>
								<RefreshCw className='w-4 h-4 mr-1' />
								Scan
							</Button>
						</div>
					</div>
				</Card>
			</div>
		);
	};

	const cloneFromDriveMutation = useMutation({
		mutationFn: () =>
			dashboardApi.cloneFromDrive({
				project_id: projectId,
				target_server_id: Number(targetEnvId),
				target_domain: driveTargetDomain,
				environment: driveEnv,
				backup_timestamp: driveTimestamp,
				source_url: driveSourceUrl || undefined,
				target_url: driveTargetDomain
					? `https://${driveTargetDomain}`
					: undefined,
				set_shell_user: setShellUser || undefined,
				run_composer_install: runComposerInstall,
				run_composer_update: runComposerUpdate,
				run_wp_plugin_update: runWpPluginUpdate,
			}),
		onSuccess: response => {
			setDriveCloneTaskId(response.data.task_id);
			toast.success('Drive clone started');
		},
		onError: (error: any) => {
			toast.error(
				error.response?.data?.detail || 'Drive clone failed to start',
			);
		},
	});

	const { taskStatus: driveCloneTaskStatus } =
		useTaskStatusPolling(driveCloneTaskId);
	const { taskStatus: runnerTaskStatus } = useTaskStatusPolling(runnerTaskId, {
		onComplete: () => {
			queryClient.invalidateQueries({
				queryKey: ['wp-cli-history', runnerEnvId],
			});
		},
	});

	useEffect(() => {
		if (!driveCloneTaskStatus) return;
		setDriveCloneStatus(driveCloneTaskStatus);
	}, [driveCloneTaskStatus]);

	useEffect(() => {
		if (!runnerTaskStatus) return;
		setRunnerStatus(runnerTaskStatus);
	}, [runnerTaskStatus]);

	// Backup download handler (using generic dashboardApi)
	const handleDownloadBackup = async (backupId: number, backupName: string) => {
		try {
			toast.loading('Starting download...', { id: 'download-toast' });
			const response = await dashboardApi.downloadBackup(backupId);

			// Create url for downloading
			const url = window.URL.createObjectURL(new Blob([response.data]));
			const link = document.createElement('a');
			link.href = url;

			// Try to get filename from content-disposition
			const contentDisposition = response.headers['content-disposition'];
			let fileName = backupName
				? `${backupName}.tar.gz`
				: `backup_${backupId}.tar.gz`;
			if (contentDisposition) {
				const fileNameMatch = contentDisposition.match(/filename="?(.+)"?/);
				if (fileNameMatch && fileNameMatch.length === 2)
					fileName = fileNameMatch[1];
			}

			link.setAttribute('download', fileName);
			document.body.appendChild(link);
			link.click();
			link.remove();

			toast.success('Download started', { id: 'download-toast' }); // update existing toast
		} catch (error: any) {
			toast.error(
				'Download failed: ' + (error.response?.data?.detail || 'Unknown error'),
				{ id: 'download-toast' },
			);
		}
	};

	// Backup restore handler
	const [restoringBackupId, setRestoringBackupId] = useState<number | null>(
		null,
	);

	const handleRestoreBackup = async (backupId: number, backupName: string) => {
		if (
			!window.confirm(
				`Are you sure you want to restore from "${backupName}"? This will overwrite your current local data.`,
			)
		) {
			return;
		}

		setRestoringBackupId(backupId);
		try {
			await dashboardApi.restoreBackupById(backupId, 'local');
			toast.success('Restore started! This may take a few minutes.');
		} catch (error: any) {
			toast.error(error.response?.data?.detail || 'Restore failed');
		} finally {
			setRestoringBackupId(null);
		}
	};

	// Fetch backups
	const { data: backupsData } = useQuery({
		queryKey: ['project-backups', projectId, backupsPage, backupsPageSize],
		queryFn: () =>
			dashboardApi.getProjectBackups(projectId, backupsPage, backupsPageSize),
		enabled: !!projectId && activeTab === 'backups',
		keepPreviousData: true,
	});
	const backups = (backupsData?.data?.items || []) as any[];
	const backupsTotal = backupsData?.data?.total || 0;
	const backupsTotalPages = Math.max(
		1,
		Math.ceil(backupsTotal / backupsPageSize),
	);
	const isAllBackupsSelected =
		backups.length > 0 && backups.every(b => selectedBackupIds.includes(b.id));

	const toggleBackupSelection = (backupId: number) => {
		setSelectedBackupIds(prev =>
			prev.includes(backupId)
				? prev.filter(id => id !== backupId)
				: [...prev, backupId],
		);
	};

	const toggleSelectAllBackups = () => {
		if (isAllBackupsSelected) {
			setSelectedBackupIds(prev =>
				prev.filter(id => !backups.some(b => b.id === id)),
			);
			return;
		}
		const pageIds = backups.map(b => b.id);
		setSelectedBackupIds(prev => Array.from(new Set([...prev, ...pageIds])));
	};

	useEffect(() => {
		setSelectedBackupIds([]);
	}, [backupsPage]);

	const handleUnlink = (envId: number, envName: string) => {
		if (
			window.confirm(
				`Unlink ${envName} environment? This won't delete the server data.`,
			)
		) {
			unlinkMutation.mutate(envId);
		}
	};

	const handleSaveDrive = () => {
		driveMutation.mutate(driveForm);
	};

	const handleSync = (sourceEnv: Environment, direction: 'push' | 'pull') => {
		setSyncSource(sourceEnv);
		setSyncDirection(direction);
		setShowSyncModal(true);
	};

	const tabs = [
		{ id: 'overview' as TabId, label: 'Overview', icon: Globe },
		{
			id: 'environments' as TabId,
			label: 'Environments',
			icon: Server,
			badge: environments.length,
		},
		{ id: 'plugins' as TabId, label: 'Plugins & Themes', icon: Package },
		{ id: 'backups' as TabId, label: 'Backups', icon: Archive },
		{ id: 'restore' as TabId, label: 'Restore', icon: RotateCcw },
		{ id: 'security' as TabId, label: 'Security', icon: Shield },
		{ id: 'git' as TabId, label: 'Git', icon: GitBranch },
	];

	const getEnvColor = (env: string) => {
		switch (env) {
			case 'production':
				return {
					bg: 'bg-green-100',
					text: 'text-green-700',
					border: 'border-green-300',
					icon: '🟢',
				};
			case 'staging':
				return {
					bg: 'bg-yellow-100',
					text: 'text-yellow-700',
					border: 'border-yellow-300',
					icon: '🟡',
				};
			case 'development':
				return {
					bg: 'bg-blue-100',
					text: 'text-blue-700',
					border: 'border-blue-300',
					icon: '🔵',
				};
			default:
				return {
					bg: 'bg-gray-100',
					text: 'text-gray-700',
					border: 'border-gray-300',
					icon: '⚪',
				};
		}
	};

	if (isLoading) {
		return (
			<div className='flex items-center justify-center h-64'>
				<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
			</div>
		);
	}

	if (!project) {
		return (
			<div className='text-center py-12'>
				<AlertTriangle className='w-12 h-12 mx-auto mb-3 text-yellow-500' />
				<h3 className='text-lg font-medium text-gray-900'>Project Not Found</h3>
				<Link
					to='/projects'
					className='mt-4 inline-flex items-center text-blue-600 hover:underline'
				>
					<ArrowLeft className='w-4 h-4 mr-2' />
					Back to Projects
				</Link>
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Header */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center space-x-4'>
					<Link to='/projects' className='text-gray-500 hover:text-gray-700'>
						<ArrowLeft className='w-5 h-5' />
					</Link>
					<div>
						<h1 className='text-2xl font-bold text-gray-900'>
							{project.project_name || project.name}
						</h1>
						<p className='text-sm text-gray-500'>
							{project.directory || project.domain}
						</p>
					</div>
					<Badge variant={project.status === 'active' ? 'success' : 'warning'}>
						{project.status}
					</Badge>
				</div>
				<div className='flex items-center space-x-3'>
					{project.wp_home && (
						<a href={project.wp_home} target='_blank' rel='noopener noreferrer'>
							<Button variant='secondary'>
								<ExternalLink className='w-4 h-4 mr-2' />
								Open Site
							</Button>
						</a>
					)}
					<Button variant='secondary'>
						<Settings className='w-4 h-4 mr-2' />
						Settings
					</Button>
				</div>
			</div>

			{/* Tabs */}
			<div className='border-b border-gray-200'>
				<nav className='flex space-x-8'>
					{tabs.map(tab => (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center px-1 py-4 border-b-2 font-medium text-sm ${
								activeTab === tab.id
									? 'border-blue-500 text-blue-600'
									: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
							}`}
						>
							<tab.icon className='w-4 h-4 mr-2' />
							{tab.label}
							{tab.badge !== undefined && tab.badge > 0 && (
								<span className='ml-2 px-2 py-0.5 text-xs bg-gray-100 rounded-full'>
									{tab.badge}
								</span>
							)}
						</button>
					))}
				</nav>
			</div>

			{/* Tab Content */}
			{activeTab === 'overview' && (
				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					{/* Environment */}
					{/* Project Status */}
					<Card title='Project Status'>
						<div className='grid grid-cols-2 gap-4'>
							<div>
								<h4 className='text-sm font-medium text-gray-500'>Name</h4>
								<p className='text-lg font-semibold text-gray-900'>
									{project.project_name || project.name}
								</p>
							</div>
							<div>
								<h4 className='text-sm font-medium text-gray-500'>Framework</h4>
								<Badge variant='success'>Bedrock</Badge>
							</div>
							<div>
								<h4 className='text-sm font-medium text-gray-500'>
									Environments
								</h4>
								<div className='flex items-center gap-2 mt-1'>
									{environments.length > 0 ? (
										environments.map(env => (
											<Badge key={env.id} className='text-xs' variant='info'>
												{env.environment.toUpperCase()}
											</Badge>
										))
									) : (
										<span className='text-gray-500 text-sm'>None linked</span>
									)}
								</div>
							</div>
						</div>
					</Card>

					{/* Integrations */}
					<Card title='Integrations'>
						<div className='space-y-4'>
							{/* GitHub */}
							<div className='flex items-center justify-between'>
								<div className='flex items-center'>
									<Github className='w-5 h-5 mr-2 text-gray-400' />
									<span>GitHub</span>
								</div>
								<Badge
									variant={project.github?.connected ? 'success' : 'default'}
								>
									{project.github?.connected ? 'Connected' : 'Not Connected'}
								</Badge>
							</div>

							{/* Google Drive */}
							<div className='border-t pt-4'>
								<div className='flex items-center justify-between mb-3'>
									<div className='flex items-center'>
										<Cloud className='w-5 h-5 mr-2 text-gray-400' />
										<span>Google Drive</span>
									</div>
									<div className='flex items-center space-x-2'>
										<Badge
											variant={
												driveSettings?.gdrive_connected ||
												driveSettings?.gdrive_global_configured
													? 'success'
													: 'default'
											}
										>
											{driveSettings?.gdrive_connected
												? 'Connected'
												: driveSettings?.gdrive_global_configured
													? 'Connected (Global)'
													: 'Not Connected'}
										</Badge>
										<button
											onClick={() => {
												setDriveForm({
													gdrive_backups_folder_id:
														driveSettings?.gdrive_backups_folder_id || '',
													gdrive_assets_folder_id:
														driveSettings?.gdrive_assets_folder_id || '',
													gdrive_docs_folder_id:
														driveSettings?.gdrive_docs_folder_id || '',
												});
												setShowDriveForm(!showDriveForm);
											}}
											className='text-sm text-primary-600 hover:underline'
										>
											{showDriveForm ? 'Cancel' : 'Configure'}
										</button>
									</div>
								</div>

								{/* Drive Settings Form */}
								{showDriveForm && (
									<div className='mt-4 p-4 bg-gray-50 rounded-lg space-y-3'>
										<div>
											<label className='block text-xs font-medium text-gray-600 mb-1'>
												Backups Folder ID
											</label>
											<input
												type='text'
												value={driveForm.gdrive_backups_folder_id}
												onChange={e =>
													setDriveForm(prev => ({
														...prev,
														gdrive_backups_folder_id: e.target.value,
													}))
												}
												placeholder='e.g., 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
												className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
											/>
											<p className='text-xs text-gray-500 mt-1'>
												Where backups will be stored
											</p>
										</div>
										<div>
											<label className='block text-xs font-medium text-gray-600 mb-1'>
												Assets Folder ID (optional)
											</label>
											<input
												type='text'
												value={driveForm.gdrive_assets_folder_id}
												onChange={e =>
													setDriveForm(prev => ({
														...prev,
														gdrive_assets_folder_id: e.target.value,
													}))
												}
												placeholder='Folder ID for project assets'
												className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
											/>
										</div>
										<div>
											<label className='block text-xs font-medium text-gray-600 mb-1'>
												Docs Folder ID (optional)
											</label>
											<input
												type='text'
												value={driveForm.gdrive_docs_folder_id}
												onChange={e =>
													setDriveForm(prev => ({
														...prev,
														gdrive_docs_folder_id: e.target.value,
													}))
												}
												placeholder='Folder ID for documentation'
												className='w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500'
											/>
										</div>
										<div className='flex justify-end pt-2'>
											<Button
												variant='primary'
												size='sm'
												onClick={handleSaveDrive}
												disabled={driveMutation.isPending}
											>
												{driveMutation.isPending
													? 'Saving...'
													: 'Save Drive Settings'}
											</Button>
										</div>
									</div>
								)}

								{/* Current folders display */}
								{!showDriveForm && driveSettings?.gdrive_connected && (
									<div className='text-xs text-gray-500 space-y-1'>
										{driveSettings.gdrive_backups_folder_id && (
											<div>
												📁 Backups:{' '}
												{driveSettings.gdrive_backups_folder_id.substring(
													0,
													20,
												)}
												...
											</div>
										)}
										{driveSettings.gdrive_assets_folder_id && (
											<div>
												📁 Assets:{' '}
												{driveSettings.gdrive_assets_folder_id.substring(0, 20)}
												...
											</div>
										)}
									</div>
								)}
							</div>
						</div>
					</Card>
				</div>
			)}

			{activeTab === 'environments' && (
				<div className='space-y-6'>
					{/* Header */}
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>
								Server Environments
							</h2>
							<p className='text-sm text-gray-500'>
								Staging and production deployments
							</p>
						</div>
						<Button variant='primary' onClick={() => setShowLinkModal(true)}>
							<Plus className='w-4 h-4 mr-2' />
							Link Environment
						</Button>
					</div>

					{/* Environments Grid */}
					{envLoading ? (
						<div className='flex justify-center py-12'>
							<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
						</div>
					) : environments.length === 0 ? (
						<Card>
							<div className='text-center py-12'>
								<Server className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Environments Linked
								</h3>
								<p className='mt-2 text-gray-500'>
									Link staging and production servers to enable sync and backup.
								</p>
								<Button
									variant='primary'
									className='mt-4'
									onClick={() => setShowLinkModal(true)}
								>
									<Plus className='w-4 h-4 mr-2' />
									Link First Environment
								</Button>
							</div>
						</Card>
					) : (
						<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
							{environments.map(env => {
								const colors = getEnvColor(env.environment);
								return (
									<Card key={env.id} className={`border-2 ${colors.border}`}>
										<div className='space-y-4'>
											{/* Header */}
											<div className='flex items-start justify-between'>
												<div>
													<div
														className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors.bg} ${colors.text}`}
													>
														{colors.icon} {env.environment.toUpperCase()}
													</div>
													<p className='mt-2 text-sm text-gray-500'>
														{env.server_name}
													</p>
												</div>
												<button
													onClick={() => handleUnlink(env.id, env.environment)}
													className='p-1 text-gray-400 hover:text-red-500'
													title='Unlink environment'
												>
													<Trash2 className='w-4 h-4' />
												</button>
												<button
													onClick={() => {
														setEditingEnv(env);
														setShowEditEnvModal(true);
													}}
													className='p-1 text-gray-400 hover:text-blue-500 ml-1'
													title='Edit environment'
												>
													<Pencil className='w-4 h-4' />
												</button>
											</div>

											{/* Details */}
											<div className='space-y-2 text-sm'>
												<div className='flex items-center'>
													<Globe className='w-4 h-4 mr-2 text-gray-400' />
													<a
														href={env.wp_url}
														target='_blank'
														rel='noopener noreferrer'
														className='text-blue-600 hover:underline truncate'
													>
														{env.wp_url}
													</a>
												</div>
												<div className='flex items-center text-gray-500'>
													<Server className='w-4 h-4 mr-2 text-gray-400' />
													<span className='truncate'>{env.wp_path}</span>
												</div>
											</div>

											{/* Actions */}
											<div className='flex items-center justify-between pt-4 border-t'>
												<div className='flex items-center space-x-2'>
													<Button
														variant='secondary'
														size='sm'
														title='Open WP Admin'
														onClick={() =>
															window.open(`${env.wp_url}/wp-admin`, '_blank')
														}
													>
														<ExternalLink className='w-4 h-4 mr-1' />
														WP Admin
													</Button>
													{env.environment === 'staging' &&
														environments.some(
															e => e.environment === 'production',
														) && (
															<Button
																variant='secondary'
																size='sm'
																title='Sync to Production'
																onClick={() => handleSync(env, 'push')}
															>
																<ArrowRight className='w-4 h-4 mr-1' />
																Push
															</Button>
														)}
													{env.environment === 'production' &&
														environments.some(
															e => e.environment === 'staging',
														) && (
															<Button
																variant='secondary'
																size='sm'
																title='Sync to Staging'
																onClick={() => handleSync(env, 'pull')}
															>
																<ArrowLeft className='w-4 h-4 mr-1' />
																Clone
															</Button>
														)}
												</div>
												<Button variant='secondary' size='sm'>
													<Archive className='w-4 h-4 mr-1' />
													Backup
												</Button>
											</div>
										</div>
									</Card>
								);
							})}
						</div>
					)}

					{/* Sync Actions (when both environments exist) */}
					{environments.length >= 2 && (
						<Card className='bg-gradient-to-r from-yellow-50 to-green-50 border-2 border-dashed border-gray-300'>
							<div className='flex items-center justify-center space-x-6 py-4'>
								<div className='text-center'>
									<span className='text-2xl'>🟡</span>
									<p className='text-sm font-medium'>Staging</p>
								</div>
								<div className='flex items-center space-x-2'>
									<Button
										variant='secondary'
										size='sm'
										onClick={() => {
											const staging = environments.find(
												e => e.environment === 'staging',
											);
											if (staging) handleSync(staging, 'push');
										}}
										title='Sync Staging to Production'
									>
										<ArrowRight className='w-4 h-4' />
									</Button>
									<ArrowLeftRight className='w-5 h-5 text-gray-400' />
									<Button
										variant='secondary'
										size='sm'
										onClick={() => {
											const production = environments.find(
												e => e.environment === 'production',
											);
											if (production) handleSync(production, 'pull');
										}}
										title='Sync Production to Staging'
									>
										<ArrowLeft className='w-4 h-4' />
									</Button>
								</div>
								<div className='text-center'>
									<span className='text-2xl'>🟢</span>
									<p className='text-sm font-medium'>Production</p>
								</div>
							</div>
							<p className='text-xs text-center text-gray-500 mt-2'>
								Click arrows to sync between environments
							</p>
						</Card>
					)}
				</div>
			)}

			{activeTab === 'plugins' && (
				<div className='space-y-6'>
					{/* Header */}
					<div>
						<h2 className='text-lg font-semibold text-gray-900'>
							Plugins & Themes
						</h2>
						<p className='text-sm text-gray-500'>
							Select an environment to view and manage WordPress plugins and
							themes
						</p>
					</div>

					{/* Environment Cards */}
					{envLoading ? (
						<div className='flex justify-center py-12'>
							<div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
						</div>
					) : environments.length === 0 ? (
						<Card>
							<div className='text-center py-12'>
								<Server className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Environments Linked
								</h3>
								<p className='mt-2 text-gray-500'>
									Link staging or production environments to view plugins.
								</p>
								<Button
									variant='primary'
									className='mt-4'
									onClick={() => setShowLinkModal(true)}
								>
									<Plus className='w-4 h-4 mr-2' />
									Link Environment
								</Button>
							</div>
						</Card>
					) : (
						<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
							{environments.map(env => {
								const colors = getEnvColor(env.environment);
								return (
									<EnvStatusCard
										key={env.id}
										env={env}
										colors={colors}
										onClick={() => {
											setActiveTab('environments');
										}}
									/>
								);
							})}
						</div>
					)}

					<Card title='WP-CLI Runner'>
						<div className='space-y-4'>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div>
									<label className='block text-xs text-gray-500 mb-1'>
										Environment
									</label>
									<select
										value={runnerEnvId}
										onChange={e => setRunnerEnvId(e.target.value)}
										className='w-full border rounded-md px-3 py-2 text-sm'
									>
										<option value=''>Select environment</option>
										{environments.map(env => (
											<option key={env.id} value={env.id}>
												{env.environment.toUpperCase()} – {env.server_name}
											</option>
										))}
									</select>
								</div>
								<div>
									<label className='block text-xs text-gray-500 mb-1'>
										Command
									</label>
									<select
										value={runnerCommand}
										onChange={e => setRunnerCommand(e.target.value)}
										className='w-full border rounded-md px-3 py-2 text-sm'
									>
										{allowedWpCommands.map(command => (
											<option key={command} value={command}>
												{command}
											</option>
										))}
									</select>
								</div>
							</div>

							<div>
								<label className='block text-xs text-gray-500 mb-1'>
									Arguments
								</label>
								<input
									value={runnerArgs}
									onChange={e => setRunnerArgs(e.target.value)}
									placeholder='--field=name --format=json'
									className='w-full border rounded-md px-3 py-2 text-sm'
								/>
								<p className='text-xs text-gray-400 mt-1'>
									Args are split on spaces before sending.
								</p>
							</div>

							<div className='flex items-center justify-between'>
								<Button
									variant='primary'
									disabled={!runnerEnvId || runWpCliMutation.isPending}
									onClick={() => runWpCliMutation.mutate()}
								>
									<Terminal className='w-4 h-4 mr-2' />
									Run Command
								</Button>
								{runnerStatus && (
									<div className='text-xs text-gray-500'>
										Status: {runnerStatus.status || 'pending'}
										{runnerStatus.message ? ` — ${runnerStatus.message}` : ''}
									</div>
								)}
							</div>

							{runnerStatus?.result?.output && (
								<div className='bg-gray-50 border rounded-md p-3 text-xs whitespace-pre-wrap'>
									{runnerStatus.result.output}
								</div>
							)}

							<div className='border-t pt-4'>
								<h4 className='text-sm font-medium text-gray-900'>
									Recent runs
								</h4>
								<div className='mt-2 space-y-2'>
									{wpCliHistory?.data?.items?.length ? (
										wpCliHistory.data.items.map((item: any) => {
											const details = parseAuditDetails(item.details);
											return (
												<div
													key={item.id}
													className='flex items-start justify-between text-xs text-gray-600'
												>
													<div>
														<div className='font-medium text-gray-800'>
															wp {details?.command || 'command'}
														</div>
														{details?.args?.length ? (
															<div className='text-gray-500'>
																{details.args.join(' ')}
															</div>
														) : null}
														<div className='text-gray-400'>
															{new Date(item.created_at).toLocaleString()}
														</div>
													</div>
													<div className='text-right'>
														<Badge
															variant={
																details?.status === 'completed'
																	? 'success'
																	: details?.status === 'failed'
																		? 'danger'
																		: 'default'
															}
														>
															{details?.status || 'queued'}
														</Badge>
													</div>
												</div>
											);
										})
									) : (
										<p className='text-xs text-gray-400'>
											No recent runs for this environment.
										</p>
									)}
								</div>
							</div>
						</div>
					</Card>

					<Card title='Plugin Policy'>
						<div className='space-y-6'>
							<div className='border rounded-md p-4 bg-gray-50'>
								<h4 className='text-sm font-medium text-gray-900'>
									Apply Vendor Bundle
								</h4>
								<p className='text-xs text-gray-500 mt-1'>
									Bundles append required plugins and pinned versions.
								</p>
								<div className='mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2'>
									<select
										value={selectedBundleId}
										onChange={e => setSelectedBundleId(e.target.value)}
										className='w-full border rounded-md px-3 py-2 text-sm'
									>
										<option value=''>Select bundle</option>
										{pluginBundlesData?.data?.map((bundle: any) => (
											<option key={bundle.id} value={bundle.id}>
												{bundle.name}
											</option>
										))}
									</select>
									<Button
										variant='secondary'
										disabled={
											!selectedBundleId || applyBundleToGlobalMutation.isPending
										}
										onClick={() => applyBundleToGlobalMutation.mutate()}
									>
										Apply to Global
									</Button>
									<Button
										variant='secondary'
										disabled={
											!projectId ||
											!selectedBundleId ||
											applyBundleToProjectMutation.isPending
										}
										onClick={() => applyBundleToProjectMutation.mutate()}
									>
										Apply to Project
									</Button>
								</div>
							</div>
							<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
								<div className='space-y-3'>
									<h4 className='text-sm font-medium text-gray-900'>
										Global Default
									</h4>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Name
										</label>
										<input
											value={globalPolicyForm.name}
											onChange={e =>
												setGlobalPolicyForm(prev => ({
													...prev,
													name: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Required plugins (one per line)
										</label>
										<textarea
											value={globalPolicyForm.required}
											onChange={e =>
												setGlobalPolicyForm(prev => ({
													...prev,
													required: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Allowed plugins (optional allowlist)
										</label>
										<textarea
											value={globalPolicyForm.allowed}
											onChange={e =>
												setGlobalPolicyForm(prev => ({
													...prev,
													allowed: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Blocked plugins
										</label>
										<textarea
											value={globalPolicyForm.blocked}
											onChange={e =>
												setGlobalPolicyForm(prev => ({
													...prev,
													blocked: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Pinned versions (slug=version)
										</label>
										<textarea
											value={globalPolicyForm.pinned}
											onChange={e =>
												setGlobalPolicyForm(prev => ({
													...prev,
													pinned: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Notes
										</label>
										<textarea
											value={globalPolicyForm.notes}
											onChange={e =>
												setGlobalPolicyForm(prev => ({
													...prev,
													notes: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={2}
										/>
									</div>
									<Button
										variant='primary'
										disabled={saveGlobalPolicyMutation.isPending}
										onClick={() => saveGlobalPolicyMutation.mutate()}
									>
										Save Global Policy
									</Button>
								</div>

								<div className='space-y-3'>
									<h4 className='text-sm font-medium text-gray-900'>
										Project Override
									</h4>
									<label className='flex items-center text-xs text-gray-600'>
										<input
											type='checkbox'
											checked={projectPolicyForm.inherit_default}
											onChange={e =>
												setProjectPolicyForm(prev => ({
													...prev,
													inherit_default: e.target.checked,
												}))
											}
											className='mr-2'
										/>
										Inherit global defaults
									</label>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Required plugins (override/add)
										</label>
										<textarea
											value={projectPolicyForm.required}
											onChange={e =>
												setProjectPolicyForm(prev => ({
													...prev,
													required: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Allowed plugins
										</label>
										<textarea
											value={projectPolicyForm.allowed}
											onChange={e =>
												setProjectPolicyForm(prev => ({
													...prev,
													allowed: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Blocked plugins
										</label>
										<textarea
											value={projectPolicyForm.blocked}
											onChange={e =>
												setProjectPolicyForm(prev => ({
													...prev,
													blocked: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Pinned versions (slug=version)
										</label>
										<textarea
											value={projectPolicyForm.pinned}
											onChange={e =>
												setProjectPolicyForm(prev => ({
													...prev,
													pinned: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={3}
										/>
									</div>
									<div>
										<label className='block text-xs text-gray-500 mb-1'>
											Notes
										</label>
										<textarea
											value={projectPolicyForm.notes}
											onChange={e =>
												setProjectPolicyForm(prev => ({
													...prev,
													notes: e.target.value,
												}))
											}
											className='w-full border rounded-md px-3 py-2 text-sm'
											rows={2}
										/>
									</div>
									<Button
										variant='primary'
										disabled={!projectId || saveProjectPolicyMutation.isPending}
										onClick={() => saveProjectPolicyMutation.mutate()}
									>
										Save Project Policy
									</Button>
								</div>
							</div>

							<div className='border-t pt-4'>
								<h4 className='text-sm font-medium text-gray-900'>
									Effective Policy
								</h4>
								{effectivePolicyData?.data ? (
									<div className='text-xs text-gray-600 space-y-2 mt-2'>
										<div>Source: {effectivePolicyData.data.source}</div>
										<div>
											Required:{' '}
											{effectivePolicyData.data.required_plugins?.length || 0}
										</div>
										<div>
											Allowed:{' '}
											{effectivePolicyData.data.allowed_plugins?.length || 0}
										</div>
										<div>
											Blocked:{' '}
											{effectivePolicyData.data.blocked_plugins?.length || 0}
										</div>
										<div>
											Pinned:{' '}
											{
												Object.keys(
													effectivePolicyData.data.pinned_versions || {},
												).length
											}
										</div>
									</div>
								) : (
									<p className='text-xs text-gray-400 mt-2'>
										No policy loaded.
									</p>
								)}
							</div>

							<div className='border-t pt-4'>
								<h4 className='text-sm font-medium text-gray-900'>
									Drift Check
								</h4>
								<p className='text-xs text-gray-500 mt-1'>
									Uses the latest WP scan for the selected environment.
								</p>
								{pluginDriftData?.data ? (
									<div className='mt-2 text-xs text-gray-600 space-y-2'>
										<div>
											Missing required:{' '}
											{pluginDriftData.data.missing_required?.length || 0}
										</div>
										<div>
											Blocked installed:{' '}
											{pluginDriftData.data.blocked_installed?.length || 0}
										</div>
										<div>
											Disallowed installed:{' '}
											{pluginDriftData.data.disallowed_installed?.length || 0}
										</div>
										<div>
											Version mismatches:{' '}
											{
												Object.keys(
													pluginDriftData.data.version_mismatches || {},
												).length
											}
										</div>

										{pluginDriftData.data.missing_required?.length ? (
											<div className='pt-2 border-t'>
												<div className='text-xs font-medium text-gray-700'>
													Missing required plugins
												</div>
												<div className='mt-1 space-y-2'>
													{pluginDriftData.data.missing_required.map(
														(plugin: string) => (
															<div
																key={plugin}
																className='flex items-center justify-between'
															>
																<span>{plugin}</span>
																<Button
																	size='sm'
																	variant='secondary'
																	disabled={
																		!runnerEnvId ||
																		runWpCliDirectMutation.isPending
																	}
																	onClick={() =>
																		runWpCliDirectMutation.mutate({
																			command: 'plugin install',
																			args: [plugin, '--activate'],
																		})
																	}
																>
																	Install
																</Button>
															</div>
														),
													)}
												</div>
											</div>
										) : null}

										{pluginDriftData.data.blocked_installed?.length ? (
											<div className='pt-2 border-t'>
												<div className='text-xs font-medium text-gray-700'>
													Blocked plugins installed
												</div>
												<div className='mt-1 space-y-2'>
													{pluginDriftData.data.blocked_installed.map(
														(plugin: string) => (
															<div
																key={plugin}
																className='flex items-center justify-between'
															>
																<span>{plugin}</span>
																<Button
																	size='sm'
																	variant='secondary'
																	disabled={
																		!runnerEnvId ||
																		runWpCliDirectMutation.isPending
																	}
																	onClick={() =>
																		runWpCliDirectMutation.mutate({
																			command: 'plugin deactivate',
																			args: [plugin],
																		})
																	}
																>
																	Deactivate
																</Button>
															</div>
														),
													)}
												</div>
											</div>
										) : null}

										{pluginDriftData.data.disallowed_installed?.length ? (
											<div className='pt-2 border-t'>
												<div className='text-xs font-medium text-gray-700'>
													Disallowed plugins installed
												</div>
												<div className='mt-1 space-y-2'>
													{pluginDriftData.data.disallowed_installed.map(
														(plugin: string) => (
															<div
																key={plugin}
																className='flex items-center justify-between'
															>
																<span>{plugin}</span>
																<Button
																	size='sm'
																	variant='secondary'
																	disabled={
																		!runnerEnvId ||
																		runWpCliDirectMutation.isPending
																	}
																	onClick={() =>
																		runWpCliDirectMutation.mutate({
																			command: 'plugin deactivate',
																			args: [plugin],
																		})
																	}
																>
																	Deactivate
																</Button>
															</div>
														),
													)}
												</div>
											</div>
										) : null}

										{Object.keys(pluginDriftData.data.version_mismatches || {})
											.length ? (
											<div className='pt-2 border-t'>
												<div className='text-xs font-medium text-gray-700'>
													Pinned version mismatches
												</div>
												<div className='mt-1 space-y-2'>
													{Object.entries(
														pluginDriftData.data.version_mismatches || {},
													).map(
														([plugin, currentVersion]: [string, string]) => {
															const pinnedVersion =
																effectivePolicyData?.data?.pinned_versions?.[
																	plugin
																];
															return (
																<div
																	key={plugin}
																	className='flex items-center justify-between'
																>
																	<span>
																		{plugin} ({currentVersion})
																	</span>
																	<Button
																		size='sm'
																		variant='secondary'
																		disabled={
																			!runnerEnvId ||
																			!pinnedVersion ||
																			runWpCliDirectMutation.isPending
																		}
																		onClick={() =>
																			runWpCliDirectMutation.mutate({
																				command: 'plugin update',
																				args: [
																					plugin,
																					`--version=${pinnedVersion}`,
																				],
																			})
																		}
																	>
																		Update
																	</Button>
																</div>
															);
														},
													)}
												</div>
											</div>
										) : null}
									</div>
								) : (
									<p className='text-xs text-gray-400 mt-2'>
										Select an environment to view drift.
									</p>
								)}
							</div>
						</div>
					</Card>
				</div>
			)}

			{activeTab === 'backups' && (
				<div className='space-y-6'>
					<BackupSchedulePanel
						projectId={projectId}
						projectName={project.project_name || project.name}
					/>
					<Card>
						<div className='flex items-center justify-between mb-4'>
							<div>
								<h2 className='text-lg font-semibold text-gray-900'>Backups</h2>
								<p className='text-sm text-gray-500'>
									Manage environment backups
								</p>
							</div>
							<div className='flex items-center gap-2'>
								<select
									value={backupEnvId}
									onChange={e => setBackupEnvId(e.target.value)}
									className='border rounded-md text-sm px-3 py-2'
								>
									<option value=''>Select Environment to Backup</option>
									{environments.map(env => (
										<option key={env.id} value={env.id}>
											{env.environment.toUpperCase()} ({env.server_name})
										</option>
									))}
								</select>

								<select
									value={backupType}
									onChange={e => setBackupType(e.target.value as any)}
									className='border rounded-md text-sm px-3 py-2'
								>
									<option value='database'>Database Only</option>
									<option value='files'>Files Only</option>
									<option value='full'>Full Backup</option>
								</select>

								<select
									value={storageType}
									onChange={e => setStorageType(e.target.value as any)}
									className='border rounded-md text-sm px-3 py-2'
								>
									<option value='gdrive'>Google Drive</option>
									<option value='local'>Local Only</option>
									<option value='both'>Both</option>
								</select>

								<Button
									variant='primary'
									onClick={() =>
										backupEnvId
											? createBackupMutation.mutate({
													envId: Number(backupEnvId),
													type: backupType,
													storage: storageType,
												})
											: toast.error('Please select an environment')
									}
									disabled={
										!backupEnvId ||
										createBackupMutation.isPending ||
										actionMutation.isPending
									}
								>
									{createBackupMutation.isPending ||
									actionMutation.isPending ? (
										<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
									) : (
										<Plus className='w-4 h-4 mr-2' />
									)}
									Create Backup
								</Button>
							</div>
						</div>

						<div className='flex items-center justify-between mb-4 border-t pt-4'>
							<label className='flex items-center gap-2 text-sm text-gray-600'>
								<input
									type='checkbox'
									checked={isAllBackupsSelected}
									onChange={toggleSelectAllBackups}
									className='rounded border-gray-300'
								/>
								Select all on page
							</label>
							<div className='flex items-center gap-3'>
								{selectedBackupIds.length > 0 && (
									<span className='text-sm text-gray-500'>
										{selectedBackupIds.length} selected
									</span>
								)}
								<Button
									variant='secondary'
									disabled={
										bulkDeleteBackupsMutation.isPending ||
										selectedBackupIds.length === 0
									}
									onClick={() => {
										if (selectedBackupIds.length === 0) return;
										const selectedBackups = backups.filter((backup: any) =>
											selectedBackupIds.includes(backup.id),
										);
										const force = selectedBackups.some(
											(backup: any) =>
												['running', 'pending', 'failed'].includes(
													String(backup.status || '').toLowerCase(),
												) ||
												(backup.storage_type?.toLowerCase() ===
													'google_drive' &&
													!backup.drive_folder_id),
										);
										bulkDeleteBackupsMutation.mutate({
											backupIds: selectedBackupIds,
											force,
										});
									}}
								>
									<Trash2 className='w-4 h-4 mr-2 text-red-500' />
									Delete Selected
								</Button>
							</div>
						</div>

						{/* Backup Timeline */}
						{backups.length > 0 ? (
							<div className='space-y-6'>
								<div className='relative'>
									<div className='absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200' />
									<div className='space-y-4'>
										{backups.map((backup: any, index: number) => (
											<div
												key={backup.id}
												className='relative flex items-start pl-10'
											>
												<div
													className={`absolute left-2 w-5 h-5 rounded-full flex items-center justify-center ${
														backup.status === 'completed'
															? 'bg-green-100 text-green-600'
															: backup.status === 'failed'
																? 'bg-red-100 text-red-600'
																: 'bg-gray-100 text-gray-400'
													}`}
												>
													{backup.status?.toLowerCase() === 'completed' ? (
														<CheckCircle className='w-3 h-3' />
													) : backup.status?.toLowerCase() === 'failed' ? (
														<XCircle className='w-3 h-3' />
													) : (
														<Clock className='w-3 h-3' />
													)}
												</div>
												<Card className='flex-1'>
													<div className='flex items-center justify-between'>
														<div className='flex items-start gap-3'>
															<input
																type='checkbox'
																checked={selectedBackupIds.includes(backup.id)}
																onChange={() =>
																	toggleBackupSelection(backup.id)
																}
																className='mt-1 rounded border-gray-300'
															/>
															<div>
																<h4 className='font-medium text-gray-900'>
																	{backup.name || `Backup #${backup.id}`}
																</h4>
																<p className='text-sm text-gray-500'>
																	{new Date(backup.created_at).toLocaleString()}
																	{backup.size_bytes
																		? ` • ${(
																				backup.size_bytes /
																				1024 /
																				1024
																			).toFixed(1)} MB`
																		: ''}
																</p>
																{backup.status?.toLowerCase() === 'failed' &&
																	backup.error_message && (
																		<div className='mt-2 p-2 bg-red-50 border border-red-100 rounded text-xs text-red-700 font-mono break-all'>
																			<strong>Error:</strong>{' '}
																			{backup.error_message}
																		</div>
																	)}
															</div>
														</div>
														<div className='flex items-center space-x-2'>
															<Button
																variant='ghost'
																size='sm'
																title='View Logs'
																onClick={() =>
																	setLogModal({
																		isOpen: true,
																		backupId: backup.id,
																		backupName: backup.name,
																		isRunning:
																			backup.status === 'pending' ||
																			backup.status === 'running' ||
																			backup.status === 'in_progress',
																	})
																}
															>
																<Terminal className='w-4 h-4 text-gray-500 hover:text-indigo-600' />
															</Button>
															<Badge
																variant={
																	backup.storage_type?.toLowerCase() ===
																		'gdrive' ||
																	backup.storage_type?.toLowerCase() ===
																		'google_drive'
																		? 'info'
																		: 'default'
																}
															>
																{backup.storage_type?.toLowerCase() ===
																	'gdrive' ||
																backup.storage_type?.toLowerCase() ===
																	'google_drive'
																	? 'Google Drive'
																	: 'Local'}
															</Badge>
															{(backup.gdrive_link || backup.drive_folder_id) &&
																(backup.storage_type?.toLowerCase() ===
																	'gdrive' ||
																	backup.storage_type?.toLowerCase() ===
																		'google_drive') && (
																	<a
																		href={
																			backup.gdrive_link ||
																			`https://drive.google.com/drive/folders/${backup.drive_folder_id}`
																		}
																		target='_blank'
																		rel='noopener noreferrer'
																		title='Open in Google Drive'
																	>
																		<Button variant='ghost' size='sm'>
																			<ExternalLink className='w-4 h-4 text-blue-500' />
																		</Button>
																	</a>
																)}
															<Button
																variant='ghost'
																size='sm'
																title='Delete'
																onClick={() => {
																	if (
																		confirm(
																			'Are you sure you want to delete this backup?',
																		)
																	) {
																		const status = String(
																			backup.status || '',
																		).toLowerCase();
																		const isDrive =
																			backup.storage_type?.toLowerCase() ===
																				'google_drive' ||
																			backup.storage_type?.toLowerCase() ===
																				'gdrive';
																		const deleteFile =
																			!isDrive ||
																			Boolean(backup.drive_folder_id);
																		const force =
																			['running', 'pending', 'failed'].includes(
																				status,
																			) ||
																			(isDrive && !backup.drive_folder_id);
																		deleteBackupMutation.mutate({
																			backupId: backup.id,
																			force,
																			deleteFile,
																		});
																	}
																}}
																disabled={deleteBackupMutation.isPending}
															>
																<Trash2 className='w-4 h-4 text-red-400' />
															</Button>
														</div>
													</div>
												</Card>
											</div>
										))}
									</div>
								</div>
								<div className='flex items-center justify-between mt-6'>
									<div className='text-sm text-gray-500'>
										Page {backupsPage} of {backupsTotalPages}
									</div>
									<div className='flex items-center gap-2'>
										<Button
											variant='secondary'
											disabled={backupsPage <= 1}
											onClick={() =>
												setBackupsPage(prev => Math.max(1, prev - 1))
											}
										>
											Previous
										</Button>
										<Button
											variant='secondary'
											disabled={backupsPage >= backupsTotalPages}
											onClick={() =>
												setBackupsPage(prev =>
													Math.min(backupsTotalPages, prev + 1),
												)
											}
										>
											Next
										</Button>
									</div>
								</div>
							</div>
						) : (
							<div className='text-center py-12'>
								<Archive className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Backups Yet
								</h3>
								<p className='mt-2 text-gray-500'>
									Create your first backup to enable point-in-time recovery.
								</p>
							</div>
						)}
					</Card>
				</div>
			)}

			{activeTab === 'restore' && (
				<div className='space-y-6'>
					{/* Step Progress */}
					<div className='flex items-center justify-center space-x-4 py-4'>
						{[1, 2, 3].map(step => (
							<div key={step} className='flex items-center'>
								<div
									className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
										restoreStep >= step
											? 'bg-blue-600 text-white'
											: 'bg-gray-200 text-gray-500'
									}`}
								>
									{step}
								</div>
								<span
									className={`ml-2 text-sm ${
										restoreStep >= step ? 'text-gray-900' : 'text-gray-400'
									}`}
								>
									{step === 1 ? 'Source' : step === 2 ? 'Backup' : 'Restore'}
								</span>
								{step < 3 && <div className='w-12 h-0.5 bg-gray-200 mx-4' />}
							</div>
						))}
					</div>

					{/* Step 1: Select Source Environment */}
					{restoreStep === 1 && (
						<Card>
							<h3 className='text-lg font-semibold text-gray-900 mb-2'>
								Select Source Environment
							</h3>
							<p className='text-sm text-gray-500 mb-6'>
								Choose an environment to restore backups from Google Drive
							</p>

							{Object.keys(driveIndex || {}).length === 0 ? (
								<div className='text-center py-12'>
									<Archive className='w-12 h-12 mx-auto mb-3 text-gray-300' />
									<h3 className='text-lg font-medium text-gray-900'>
										No Backups Found
									</h3>
									<p className='mt-2 text-gray-500'>
										No backup folders found in Google Drive for this project.
									</p>
								</div>
							) : (
								<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
									{Object.entries(driveIndex || {}).map(
										([envName, backups]: [string, any]) => {
											const backupCount = Array.isArray(backups)
												? backups.length
												: 0;
											const lastBackup =
												Array.isArray(backups) && backups.length > 0
													? backups[0]
													: null;
											const isStaging = envName
												.toLowerCase()
												.includes('staging');

											return (
												<div
													key={envName}
													className='cursor-pointer'
													onClick={() => {
														setDriveEnv(envName);
														setDriveTimestamp('');
														setSelectedBackup(null);
														const envMatch = environments.find(
															e => e.environment === envName,
														);
														if (envMatch?.wp_url) {
															setDriveSourceUrl(envMatch.wp_url);
														}
														setRestoreStep(2);
													}}
												>
													<Card
														className={`hover:shadow-lg transition-all duration-200 border-2 ${
															isStaging
																? 'border-yellow-200 hover:border-yellow-400'
																: 'border-green-200 hover:border-green-400'
														}`}
													>
														<div className='space-y-3'>
															<div className='flex items-center justify-between'>
																<div
																	className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
																		isStaging
																			? 'bg-yellow-100 text-yellow-800'
																			: 'bg-green-100 text-green-800'
																	}`}
																>
																	{isStaging ? '🟡' : '🟢'}{' '}
																	{envName.toUpperCase()}
																</div>
																<ArrowRight className='w-5 h-5 text-gray-400' />
															</div>

															<div className='pt-2'>
																<div className='text-2xl font-bold text-gray-900'>
																	{backupCount}
																</div>
																<div className='text-xs text-gray-500'>
																	backups available
																</div>
															</div>

															{lastBackup && (
																<div className='text-xs text-gray-400 pt-2 border-t'>
																	Last:{' '}
																	{formatBackupTimestamp(lastBackup.timestamp)}
																</div>
															)}
														</div>
													</Card>
												</div>
											);
										},
									)}
								</div>
							)}
						</Card>
					)}

					{/* Step 2: Choose Backup */}
					{restoreStep === 2 && (
						<Card>
							<div className='flex items-center justify-between mb-4'>
								<div>
									<button
										onClick={() => setRestoreStep(1)}
										className='text-sm text-blue-600 hover:underline flex items-center'
									>
										<ArrowLeft className='w-4 h-4 mr-1' />
										Back to environments
									</button>
									<h3 className='text-lg font-semibold text-gray-900 mt-2'>
										{driveEnv.toUpperCase()} Backups
									</h3>
								</div>
							</div>

							<div className='space-y-3'>
								{((driveIndex || {})[driveEnv] || []).map((backup: any) => (
									<div
										key={backup.timestamp}
										className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
											driveTimestamp === backup.timestamp
												? 'border-blue-500 bg-blue-50'
												: 'border-gray-200 hover:border-blue-300'
										}`}
										onClick={() => {
											setDriveTimestamp(backup.timestamp);
											setSelectedBackup(backup);
										}}
									>
										<div className='flex items-center justify-between'>
											<div className='flex items-center'>
												<Archive className='w-5 h-5 mr-3 text-gray-400' />
												<div>
													<div className='font-medium text-gray-900'>
														{formatBackupTimestamp(backup.timestamp)}
													</div>
													<div className='text-sm text-gray-500'>
														{backup.type || 'Full backup'}
														{backup.size ? ` • ${backup.size}` : ''}
													</div>
												</div>
											</div>
											{driveTimestamp === backup.timestamp && (
												<CheckCircle className='w-5 h-5 text-blue-600' />
											)}
										</div>
									</div>
								))}
							</div>

							<div className='mt-6 flex justify-end'>
								<Button
									variant='primary'
									disabled={!driveTimestamp}
									onClick={() => setRestoreStep(3)}
								>
									Continue to Configure
									<ArrowRight className='w-4 h-4 ml-2' />
								</Button>
							</div>
						</Card>
					)}

					{/* Step 3: Configure & Restore */}
					{restoreStep === 3 && (
						<Card>
							<div className='flex items-center justify-between mb-4'>
								<div>
									<button
										onClick={() => setRestoreStep(2)}
										className='text-sm text-blue-600 hover:underline flex items-center'
									>
										<ArrowLeft className='w-4 h-4 mr-1' />
										Back to backup selection
									</button>
									<h3 className='text-lg font-semibold text-gray-900 mt-2'>
										Restore: {driveEnv} -{' '}
										{formatBackupTimestamp(driveTimestamp)}
									</h3>
								</div>
							</div>

							<div className='space-y-4'>
								<div>
									<label className='block text-sm font-medium mb-1'>
										Target Environment
									</label>
									<select
										className='w-full border rounded-lg px-3 py-2'
										value={targetEnvId}
										onChange={e => {
											const envId = Number(e.target.value) || '';
											setTargetEnvId(envId);
											const envMatch = environments.find(
												env => env.id === envId,
											);
											if (envMatch?.wp_url) {
												try {
													const url = new URL(envMatch.wp_url);
													setDriveTargetDomain(url.hostname);
													setSetShellUser(url.hostname);
												} catch (e) {
													/* ignore */
												}
											}
										}}
									>
										<option value=''>Select target environment</option>
										{environments.map(env => (
											<option key={env.id} value={env.id}>
												{env.environment.toUpperCase()} • {env.server_name}
											</option>
										))}
									</select>
								</div>

								<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
									<div>
										<label className='block text-sm font-medium mb-1'>
											Source URL (for URL replacement)
										</label>
										<input
											className='w-full border rounded-lg px-3 py-2'
											value={driveSourceUrl}
											onChange={e => setDriveSourceUrl(e.target.value)}
											placeholder='https://old-domain.com'
										/>
									</div>
									<div>
										<label className='block text-sm font-medium mb-1'>
											Target Domain
										</label>
										<input
											className='w-full border rounded-lg px-3 py-2'
											value={driveTargetDomain}
											onChange={e => {
												setDriveTargetDomain(e.target.value);
												setSetShellUser(e.target.value);
											}}
											placeholder='site.example.com'
										/>
									</div>
								</div>

								<div>
									<label className='block text-sm font-medium mb-1'>
										System User
									</label>
									<input
										className='w-full border rounded-lg px-3 py-2 max-w-xs'
										value={setShellUser}
										onChange={e => setSetShellUser(e.target.value)}
										placeholder='siteuser'
									/>
								</div>

								<div className='border-t pt-4 mt-4'>
									<h4 className='text-sm font-medium text-gray-700 mb-3'>
										Post-Restore Actions
									</h4>
									<div className='space-y-2'>
										<label className='flex items-center gap-2 text-sm'>
											<input
												type='checkbox'
												checked={runComposerInstall}
												onChange={e => setRunComposerInstall(e.target.checked)}
												className='rounded'
											/>
											Run composer install
										</label>
										<label className='flex items-center gap-2 text-sm'>
											<input
												type='checkbox'
												checked={runComposerUpdate}
												onChange={e => setRunComposerUpdate(e.target.checked)}
												className='rounded'
											/>
											Run composer update
										</label>
										<label className='flex items-center gap-2 text-sm'>
											<input
												type='checkbox'
												checked={runWpPluginUpdate}
												onChange={e => setRunWpPluginUpdate(e.target.checked)}
												className='rounded'
											/>
											Update WP plugins
										</label>
									</div>
								</div>

								<div className='bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start'>
									<AlertTriangle className='w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5' />
									<div className='text-sm text-yellow-800'>
										<strong>Warning:</strong> This will overwrite the target
										environment's database and files. Make sure you have a
										backup of the target before proceeding.
									</div>
								</div>

								<div className='flex justify-between pt-4'>
									<Button
										variant='secondary'
										onClick={() => {
											setRestoreStep(1);
											setDriveEnv('');
											setDriveTimestamp('');
											setSelectedBackup(null);
										}}
									>
										Cancel
									</Button>
									<Button
										variant='primary'
										onClick={() => cloneFromDriveMutation.mutate()}
										disabled={
											!projectId ||
											!driveEnv ||
											!driveTimestamp ||
											!targetEnvId ||
											!driveTargetDomain ||
											cloneFromDriveMutation.isPending
										}
									>
										{cloneFromDriveMutation.isPending
											? 'Starting…'
											: 'Restore Now'}
									</Button>
								</div>

								{driveCloneTaskId && (
									<div className='mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700'>
										<strong>Task:</strong> {driveCloneTaskId} •{' '}
										{driveCloneStatus?.status || 'pending'} •{' '}
										{driveCloneStatus?.message || 'Working...'}
									</div>
								)}
							</div>
						</Card>
					)}
				</div>
			)}

			{activeTab === 'git' && (
				<Card title='Git History'>
					<p className='text-gray-500'>
						Git commits and history will appear here
					</p>
				</Card>
			)}

			{activeTab === 'security' && (
				<div className='space-y-6'>
					{/* Security Scan Header */}
					<div className='flex items-center justify-between'>
						<div>
							<h2 className='text-lg font-semibold text-gray-900'>
								Security Scan
							</h2>
							<p className='text-sm text-gray-500'>
								Analyze your site for common security issues
							</p>
						</div>
						<div className='flex items-center gap-3'>
							<select
								value={securityEnvId}
								onChange={e => setSecurityEnvId(e.target.value)}
								className='border rounded-md text-sm px-3 py-2'
							>
								<option value=''>Select Environment to Scan</option>
								{environments.map(env => (
									<option key={env.id} value={env.id}>
										{env.environment.toUpperCase()} ({env.server_name})
									</option>
								))}
							</select>
							<Button
								variant='primary'
								onClick={runSecurityScan}
								disabled={isScanning || !securityEnvId}
							>
								{isScanning ? (
									<>
										<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
										Scanning...
									</>
								) : (
									<>
										<Shield className='w-4 h-4 mr-2' />
										Run Security Scan
									</>
								)}
							</Button>
						</div>
					</div>

					{/* Scan Results */}
					{securityScanResult ? (
						<div className='space-y-6'>
							{/* Score Card */}
							<Card>
								<div className='flex items-center justify-between'>
									<div className='flex items-center space-x-4'>
										<div
											className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold ${
												securityScanResult.overall_status === 'pass'
													? 'bg-green-100 text-green-700'
													: securityScanResult.overall_status === 'warn'
														? 'bg-yellow-100 text-yellow-700'
														: 'bg-red-100 text-red-700'
											}`}
										>
											{securityScanResult.score}
										</div>
										<div>
											<h3 className='text-xl font-semibold text-gray-900'>
												Security Score: {securityScanResult.score}/100
											</h3>
											<p className='text-sm text-gray-500'>
												Scanned at{' '}
												{new Date(
													securityScanResult.scanned_at,
												).toLocaleString()}
											</p>
										</div>
									</div>
									<div className='flex items-center space-x-4'>
										<div className='text-center'>
											<div className='text-2xl font-bold text-green-600'>
												{securityScanResult.summary.pass}
											</div>
											<div className='text-xs text-gray-500'>Passed</div>
										</div>
										<div className='text-center'>
											<div className='text-2xl font-bold text-yellow-600'>
												{securityScanResult.summary.warn}
											</div>
											<div className='text-xs text-gray-500'>Warnings</div>
										</div>
										<div className='text-center'>
											<div className='text-2xl font-bold text-red-600'>
												{securityScanResult.summary.fail}
											</div>
											<div className='text-xs text-gray-500'>Failed</div>
										</div>
									</div>
								</div>
							</Card>

							{/* Check Results */}
							<Card title='Security Checks'>
								<div className='divide-y'>
									{securityScanResult.checks.map((check, index) => (
										<div key={index} className='py-4 first:pt-0 last:pb-0'>
											<div className='flex items-start justify-between'>
												<div className='flex items-start space-x-3'>
													<div
														className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center ${
															check.status === 'pass'
																? 'bg-green-100 text-green-600'
																: check.status === 'warn'
																	? 'bg-yellow-100 text-yellow-600'
																	: 'bg-red-100 text-red-600'
														}`}
													>
														{check.status === 'pass' ? (
															<CheckCircle className='w-4 h-4' />
														) : check.status === 'warn' ? (
															<AlertCircle className='w-4 h-4' />
														) : (
															<XCircle className='w-4 h-4' />
														)}
													</div>
													<div>
														<h4 className='font-medium text-gray-900'>
															{check.name}
														</h4>
														<p className='text-sm text-gray-600 mt-0.5'>
															{check.message}
														</p>
														{check.details &&
															Object.keys(check.details).length > 0 && (
																<div className='mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded'>
																	{Object.entries(check.details).map(
																		([key, value]) => (
																			<div key={key}>
																				<span className='font-medium'>
																					{key}:
																				</span>{' '}
																				{String(value)}
																			</div>
																		),
																	)}
																</div>
															)}
													</div>
												</div>
												<Badge
													variant={
														check.severity === 'critical' ||
														check.severity === 'high'
															? 'danger'
															: check.severity === 'medium'
																? 'warning'
																: 'default'
													}
												>
													{check.severity}
												</Badge>
											</div>
										</div>
									))}
								</div>
							</Card>
						</div>
					) : (
						<Card>
							<div className='text-center py-12'>
								<Shield className='w-12 h-12 mx-auto mb-3 text-gray-300' />
								<h3 className='text-lg font-medium text-gray-900'>
									No Scan Results
								</h3>
								<p className='mt-2 text-gray-500'>
									Run a security scan to analyze your site for vulnerabilities.
								</p>
								<Button
									variant='primary'
									className='mt-4'
									onClick={runSecurityScan}
									disabled={isScanning}
								>
									{isScanning ? (
										<>
											<RefreshCw className='w-4 h-4 mr-2 animate-spin' />
											Scanning...
										</>
									) : (
										<>
											<Shield className='w-4 h-4 mr-2' />
											Run First Scan
										</>
									)}
								</Button>
							</div>
						</Card>
					)}
				</div>
			)}

			{/* Link Environment Modal */}
			{projectId && (
				<LinkEnvironmentModal
					projectId={projectId}
					projectName={project.project_name || project.name}
					isOpen={showLinkModal}
					onClose={() => setShowLinkModal(false)}
					existingEnvironments={environments.map(e => e.environment)}
				/>
			)}

			{projectId && showEditEnvModal && editingEnv && (
				<EditEnvironmentModal
					isOpen={showEditEnvModal}
					onClose={() => {
						setShowEditEnvModal(false);
						setEditingEnv(null);
					}}
					projectId={projectId}
					environment={editingEnv}
				/>
			)}

			{/* Sync Modal */}
			{projectId && (
				<SyncModal
					isOpen={showSyncModal}
					onClose={() => {
						setShowSyncModal(false);
						setSyncSource(null);
					}}
					projectId={projectId}
					projectName={project?.project_name || project?.name || ''}
					environments={environments}
					initialSource={syncSource || undefined}
					initialDirection={syncDirection}
				/>
			)}

			<TaskLogModal
				isOpen={logModal.isOpen}
				onClose={() => setLogModal({ ...logModal, isOpen: false })}
				backupId={logModal.backupId}
				backupName={logModal.backupName}
				isRunning={logModal.isRunning}
			/>
		</div>
	);
}
