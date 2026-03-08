import React, { useState, useEffect } from 'react';
import { useNavigate } from '@/router/compat';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	ArrowRight,
	Check,
	Github,
	Tag,
	Loader2,
	FolderKanban,
	Info,
	Server,
	Cloud,
	Plus,
	FolderSearch,
	RefreshCw,
	Download,
	Sparkles,
	CheckCircle,
	AlertCircle,
	Globe,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { dashboardApi } from '@/services/api';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface ScannedSite {
	path: string;
	wp_path: string;
	is_bedrock: boolean;
	site_url: string | null;
	site_name: string | null;
	wp_version: string | null;
	php_version?: string | null;
	domain: string | null;
	imported: boolean;
}

type WizardMode = 'choose' | 'import' | 'create';

interface WizardFormData {
	mode: WizardMode;
	server_id: number | null;
	scanned_site: ScannedSite | null;
	name: string;
	domain: string;
	site_title: string;
	description: string;
	environment: 'staging' | 'production' | 'development';
	tags: string[];
	deploy_method: 'github' | 'blank' | 'existing';
	github_repo_url: string;
	github_branch: string;
	create_on_cyberpanel: boolean;
	php_version: string;
	create_database: boolean;
	db_name: string;
	db_user: string;
	db_password: string;
	issue_ssl: boolean;
	gdrive_backups_folder_id: string;
	auto_create_schedule: boolean;
	schedule_frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
	schedule_hour: number;
	schedule_minute: number;
}

const INITIAL_FORM_DATA: WizardFormData = {
	mode: 'choose',
	server_id: null,
	scanned_site: null,
	name: '',
	domain: '',
	site_title: '',
	description: '',
	environment: 'production',
	tags: [],
	deploy_method: 'existing',
	github_repo_url: '',
	github_branch: 'main',
	create_on_cyberpanel: false,
	php_version: '8.2',
	create_database: false,
	db_name: '',
	db_user: '',
	db_password: '',
	issue_ssl: true,
	gdrive_backups_folder_id: '',
	auto_create_schedule: false,
	schedule_frequency: 'daily',
	schedule_hour: 2,
	schedule_minute: 0,
};

export default function CreateProjectWizard() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [formData, setWizardFormData] =
		useState<WizardFormData>(INITIAL_FORM_DATA);
	const [scanResults, setScanResults] = useState<ScannedSite[]>([]);
	const [scanBasePath, setScanBasePath] = useState('/home');
	const [tagInput, setTagInput] = useState('');
	const [isScanning, setIsScanning] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [isHydratingEnv, setIsHydratingEnv] = useState(false);

	const { data: serversData, isLoading: serversLoading } = useQuery({
		queryKey: ['servers'],
		queryFn: () => dashboardApi.getServers(),
	});
	const servers = serversData?.data || [];

	const { data: tagsData } = useQuery({
		queryKey: ['tags'],
		queryFn: () => dashboardApi.getTags(),
	});
	const existingTags = tagsData?.data || [];

	const updateForm = (key: keyof WizardFormData, value: any) => {
		setWizardFormData(prev => ({ ...prev, [key]: value }));
	};

	useEffect(() => {
		if (formData.server_id) {
			const selectedServer = servers.find(
				(s: any) => s.id === formData.server_id,
			);
			setScanBasePath(
				selectedServer?.panel_type === 'cyberpanel' ? '/home' : '/var/www',
			);
		}
	}, [formData.server_id, servers]);

	const scanSitesMutation = useMutation({
		mutationFn: ({
			serverId,
			basePath,
		}: {
			serverId: number;
			basePath: string;
		}) =>
			api.post<{ success: boolean; sites: ScannedSite[]; message?: string }>(
				`/servers/${serverId}/scan-sites?base_path=${encodeURIComponent(
					basePath,
				)}&max_depth=4`,
				{},
			),
		onSuccess: (response: any) => {
			setIsScanning(false);
			if (response.data.success) {
				setScanResults(response.data.sites || []);
				if (response.data.sites?.length === 0) {
					toast.error('No WordPress sites found in the specified path');
				} else {
					toast.success(
						`Found ${response.data.sites.length} WordPress site(s)`,
					);
				}
			} else {
				toast.error(response.data.message || 'Failed to scan for sites');
			}
		},
		onError: (error: any) => {
			setIsScanning(false);
			console.error('Scan error:', error);
			toast.error(error.response?.data?.detail || 'Failed to scan for sites');
		},
	});

	const handleScan = () => {
		if (!formData.server_id) {
			toast.error('Please select a server first');
			return;
		}
		setIsScanning(true);
		setScanResults([]);
		scanSitesMutation.mutate({
			serverId: formData.server_id,
			basePath: scanBasePath,
		});
	};

	const handleSelectSite = (site: ScannedSite) => {
		const projectName =
			site.site_name ||
			site.domain ||
			site.path.split('/').pop() ||
			'imported-project';
		setWizardFormData(prev => ({
			...prev,
			scanned_site: site,
			name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
			domain: site.domain || '',
			site_title: site.site_name || '',
		}));
	};

	const createMutation = useMutation({
		mutationFn: async (data: any) => {
			const response = await dashboardApi.createProject(data);
			return response;
		},
		onSuccess: async (response: any) => {
			const projectId = response.data?.id;

			// If importing from a server, link the environment
			if (
				formData.mode === 'import' &&
				formData.server_id &&
				formData.scanned_site &&
				projectId
			) {
				try {
					setIsHydratingEnv(true);
					let resolvedDbName = formData.db_name;
					let resolvedDbUser = formData.db_user;
					let resolvedDbPassword = formData.db_password;
					let resolvedWpUrl =
						formData.scanned_site.site_url || `https://${formData.domain}`;

					if (!resolvedDbName || !resolvedDbUser || !resolvedDbPassword) {
						try {
							const envResponse = await dashboardApi.readServerEnv(
								formData.server_id,
								formData.scanned_site.path,
							);
							const env = envResponse?.data?.env;
							if (env) {
								resolvedDbName = resolvedDbName || env.db_name || '';
								resolvedDbUser = resolvedDbUser || env.db_user || '';
								resolvedDbPassword =
									resolvedDbPassword || env.db_password || '';
								resolvedWpUrl = env.wp_home || env.wp_siteurl || resolvedWpUrl;
							}
						} catch (hydrateError) {
							console.warn(
								'Failed to hydrate environment from .env',
								hydrateError,
							);
						}
					}

					const linkResponse = await dashboardApi.linkEnvironment(projectId, {
						server_id: formData.server_id,
						environment: formData.environment,
						wp_url: resolvedWpUrl,
						wp_path: formData.scanned_site.wp_path,
						database_name:
							resolvedDbName || `${formData.name.replace(/-/g, '_')}_db`,
						database_user: resolvedDbUser || 'wp_user',
						database_password: resolvedDbPassword || undefined,
						gdrive_backups_folder_id:
							formData.gdrive_backups_folder_id || undefined,
					});

					if (formData.auto_create_schedule) {
						await dashboardApi.createSchedule({
							name: `${formData.name} ${formData.environment} backup`,
							project_id: projectId,
							environment_id: linkResponse.data?.id,
							frequency: formData.schedule_frequency,
							hour: formData.schedule_hour,
							minute: formData.schedule_minute,
							backup_type: 'full',
							storage_type: 'google_drive',
							retention_count: 7,
						});
					}

					if (!resolvedDbPassword) {
						toast.success(
							'Project linked. Database password was empty and can be updated later.',
						);
					} else {
						toast.success('Project created and linked to server!');
					}
				} catch (err: any) {
					console.error('Failed to link environment:', err);
					toast.success('Project created, but failed to link environment');
				} finally {
					setIsHydratingEnv(false);
				}
			} else {
				toast.success('Project created successfully!');
			}

			queryClient.invalidateQueries({ queryKey: ['remote-projects'] });
			navigate('/projects');
		},
		onError: (error: any) => {
			toast.error(error.response?.data?.detail || 'Failed to create project');
		},
	});

	const handleSubmit = () => {
		if (!formData.name.trim()) {
			toast.error('Project name is required');
			return;
		}

		const projectData: any = {
			name: formData.name,
			domain: formData.domain || undefined,
			site_title: formData.site_title || formData.name,
			description: formData.description || undefined,
			tags: formData.tags.length > 0 ? formData.tags : undefined,
		};

		if (formData.mode === 'create' && formData.deploy_method === 'github') {
			projectData.github_repo_url = formData.github_repo_url || undefined;
			projectData.github_branch = formData.github_branch || 'main';
		}

		createMutation.mutate(projectData);
	};

	const addTag = (tag: string) => {
		const trimmed = tag.trim().toLowerCase();
		if (trimmed && !formData.tags.includes(trimmed)) {
			updateForm('tags', [...formData.tags, trimmed]);
		}
		setTagInput('');
	};

	const toggleExistingTag = (tagName: string) => {
		if (formData.tags.includes(tagName)) {
			removeTag(tagName);
			return;
		}
		addTag(tagName);
	};

	const removeTag = (tag: string) => {
		updateForm(
			'tags',
			formData.tags.filter(t => t !== tag),
		);
	};

	const selectedServer = servers.find((s: any) => s.id === formData.server_id);
	const availableSites = scanResults.filter(site => !site.imported);
	const importedSites = scanResults.filter(site => site.imported);

	// Render mode selection (initial screen)
	const renderChooseMode = () => (
		<div className='space-y-6'>
			<div className='text-center mb-8'>
				<h2 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>
					How would you like to add a project?
				</h2>
				<p className='text-gray-600 dark:text-gray-400'>
					Import an existing WordPress site or create a new project from scratch
				</p>
			</div>

			<div className='grid md:grid-cols-2 gap-6 max-w-3xl mx-auto'>
				{/* Import Option - Recommended */}
				<div
					className='bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 cursor-pointer transition-all hover:shadow-lg border-2 border-emerald-500'
					onClick={() => updateForm('mode', 'import')}
				>
					<div className='flex flex-col items-center text-center space-y-4'>
						<div className='w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center'>
							<Download className='w-8 h-8 text-emerald-600 dark:text-emerald-400' />
						</div>
						<div>
							<div className='flex items-center justify-center gap-2 mb-2'>
								<h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
									Import Existing Site
								</h3>
								<Badge variant='success'>Recommended</Badge>
							</div>
							<p className='text-sm text-gray-600 dark:text-gray-400'>
								Scan a server to discover WordPress sites and import them with
								auto-populated details
							</p>
						</div>
						<ul className='text-xs text-left text-gray-500 dark:text-gray-400 space-y-1'>
							<li className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3 text-emerald-500' />
								Auto-detects site name & domain
							</li>
							<li className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3 text-emerald-500' />
								Links to server environment
							</li>
							<li className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3 text-emerald-500' />
								Identifies Bedrock installations
							</li>
						</ul>
					</div>
				</div>

				{/* Create New Option */}
				<div
					className='bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 cursor-pointer transition-all hover:shadow-lg border-2 border-transparent hover:border-blue-300 dark:hover:border-blue-700'
					onClick={() => updateForm('mode', 'create')}
				>
					<div className='flex flex-col items-center text-center space-y-4'>
						<div className='w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center'>
							<Plus className='w-8 h-8 text-blue-600 dark:text-blue-400' />
						</div>
						<div>
							<h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
								Create New Project
							</h3>
							<p className='text-sm text-gray-600 dark:text-gray-400'>
								Start fresh with a new project. Optionally deploy from GitHub or
								create on CyberPanel
							</p>
						</div>
						<ul className='text-xs text-left text-gray-500 dark:text-gray-400 space-y-1'>
							<li className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3 text-blue-500' />
								GitHub repository deployment
							</li>
							<li className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3 text-blue-500' />
								CyberPanel site creation
							</li>
							<li className='flex items-center gap-1'>
								<CheckCircle className='w-3 h-3 text-blue-500' />
								Blank project setup
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);

	// Render import mode (scan and select)
	const renderImportMode = () => (
		<div className='space-y-6'>
			{/* Back button */}
			<button
				onClick={() => {
					setWizardFormData(INITIAL_FORM_DATA);
					setScanResults([]);
				}}
				className='flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
			>
				<ArrowLeft className='w-4 h-4' />
				Back to options
			</button>

			<div className='grid md:grid-cols-2 gap-6'>
				{/* Left: Server selection and scan */}
				<div className='space-y-4'>
					<Card className='p-4'>
						<h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
							<Server className='w-5 h-5' />
							Select Server
						</h3>

						{serversLoading ? (
							<div className='flex items-center justify-center py-8'>
								<Loader2 className='w-6 h-6 animate-spin text-emerald-500' />
							</div>
						) : servers.length === 0 ? (
							<div className='text-center py-8'>
								<AlertCircle className='w-12 h-12 text-yellow-500 mx-auto mb-3' />
								<p className='text-gray-600 dark:text-gray-400 mb-4'>
									No servers configured yet
								</p>
								<Button onClick={() => navigate('/servers/new')} size='sm'>
									Add Server
								</Button>
							</div>
						) : (
							<div className='space-y-3'>
								{servers.map((server: any) => (
									<div
										key={server.id}
										onClick={() => updateForm('server_id', server.id)}
										className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
											formData.server_id === server.id
												? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
												: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
										}`}
									>
										<div className='flex items-center justify-between'>
											<div>
												<p className='font-medium text-gray-900 dark:text-white'>
													{server.name}
												</p>
												<p className='text-sm text-gray-500'>
													{server.hostname} • {server.panel_type || 'SSH'}
												</p>
											</div>
											{formData.server_id === server.id && (
												<CheckCircle className='w-5 h-5 text-emerald-500' />
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</Card>

					{formData.server_id && (
						<Card className='p-4'>
							<h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
								<FolderSearch className='w-5 h-5' />
								Scan for Sites
							</h3>

							<div className='space-y-3'>
								<div>
									<label className='block text-sm font-medium mb-1'>
										Base Path
									</label>
									<input
										type='text'
										value={scanBasePath}
										onChange={e => setScanBasePath(e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='/home or /var/www'
									/>
									<p className='text-xs text-gray-500 mt-1'>
										Directory to scan for WordPress installations
									</p>
								</div>

								<Button
									onClick={handleScan}
									disabled={isScanning}
									className='w-full'
									variant='primary'
								>
									{isScanning ? (
										<>
											<Loader2 className='w-4 h-4 animate-spin mr-2' />
											Scanning...
										</>
									) : (
										<>
											<RefreshCw className='w-4 h-4 mr-2' />
											Scan for WordPress Sites
										</>
									)}
								</Button>
							</div>
						</Card>
					)}
				</div>

				{/* Right: Scan results or selected site form */}
				<div className='space-y-4'>
					{!formData.scanned_site ? (
						<Card className='p-4'>
							<h3 className='text-lg font-semibold mb-4 flex items-center gap-2'>
								<Globe className='w-5 h-5' />
								Discovered Sites
							</h3>

							{scanResults.length === 0 ? (
								<div className='text-center py-12 text-gray-500'>
									<FolderSearch className='w-12 h-12 mx-auto mb-3 opacity-50' />
									<p>Select a server and scan to discover WordPress sites</p>
								</div>
							) : (
								<div className='space-y-4'>
									{availableSites.length > 0 && (
										<div>
											<p className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
												Available ({availableSites.length})
											</p>
											<div className='space-y-2 max-h-64 overflow-y-auto'>
												{availableSites.map((site, idx) => (
													<div
														key={idx}
														onClick={() => handleSelectSite(site)}
														className='p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all'
													>
														<div className='flex items-start justify-between'>
															<div className='flex-1 min-w-0'>
																<p className='font-medium text-gray-900 dark:text-white truncate'>
																	{site.site_name ||
																		site.domain ||
																		'Unknown Site'}
																</p>
																<p className='text-sm text-gray-500 truncate'>
																	{site.path}
																</p>
																<div className='flex items-center gap-2 mt-1'>
																	{site.is_bedrock && (
																		<Badge variant='success'>Bedrock</Badge>
																	)}
																	{site.wp_version && (
																		<Badge variant='default'>
																			WP {site.wp_version}
																		</Badge>
																	)}
																</div>
															</div>
															<ArrowRight className='w-4 h-4 text-gray-400 flex-shrink-0 ml-2' />
														</div>
													</div>
												))}
											</div>
										</div>
									)}

									{importedSites.length > 0 && (
										<div>
											<p className='text-sm font-medium text-gray-500 mb-2'>
												Already Imported ({importedSites.length})
											</p>
											<div className='space-y-2 opacity-60'>
												{importedSites.map((site, idx) => (
													<div
														key={idx}
														className='p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'
													>
														<p className='font-medium text-gray-600 dark:text-gray-400'>
															{site.site_name || site.domain || 'Unknown Site'}
														</p>
														<p className='text-sm text-gray-400'>{site.path}</p>
													</div>
												))}
											</div>
										</div>
									)}
								</div>
							)}
						</Card>
					) : (
						/* Selected site - show form */
						<Card className='p-4'>
							<div className='flex items-center justify-between mb-4'>
								<h3 className='text-lg font-semibold flex items-center gap-2'>
									<Sparkles className='w-5 h-5 text-emerald-500' />
									Configure Import
								</h3>
								<button
									onClick={() => updateForm('scanned_site', null)}
									className='text-sm text-gray-500 hover:text-gray-700'
								>
									Change site
								</button>
							</div>

							<div className='p-3 mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'>
								<p className='font-medium text-emerald-800 dark:text-emerald-200'>
									{formData.scanned_site.site_name ||
										formData.scanned_site.domain}
								</p>
								<p className='text-sm text-emerald-600 dark:text-emerald-400'>
									{formData.scanned_site.path}
								</p>
							</div>

							<div className='space-y-4'>
								<div>
									<label className='block text-sm font-medium mb-1'>
										Project Name *
									</label>
									<input
										type='text'
										value={formData.name}
										onChange={e => updateForm('name', e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='my-project'
									/>
								</div>

								<div>
									<label className='block text-sm font-medium mb-1'>
										Domain
									</label>
									<input
										type='text'
										value={formData.domain}
										onChange={e => updateForm('domain', e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='example.com'
									/>
								</div>

								<div>
									<label className='block text-sm font-medium mb-1'>
										Site Title
									</label>
									<input
										type='text'
										value={formData.site_title}
										onChange={e => updateForm('site_title', e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='My Website'
									/>
								</div>

								<div>
									<label className='block text-sm font-medium mb-1'>
										Environment
									</label>
									<select
										value={formData.environment}
										onChange={e => updateForm('environment', e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
									>
										<option value='production'>Production</option>
										<option value='staging'>Staging</option>
										<option value='development'>Development</option>
									</select>
								</div>

								<div>
									<label className='block text-sm font-medium mb-1'>
										Description
									</label>
									<textarea
										value={formData.description}
										onChange={e => updateForm('description', e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										rows={2}
										placeholder='Brief description of this project'
									/>
								</div>

								{/* Tags */}
								<div>
									<label className='block text-sm font-medium mb-1'>Tags</label>
									<div className='flex flex-wrap gap-2 mb-2'>
										{formData.tags.map(tag => (
											<span
												key={tag}
												className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600'
												onClick={() => removeTag(tag)}
											>
												{tag} ×
											</span>
										))}
									</div>
									<div className='flex gap-2'>
										<input
											type='text'
											value={tagInput}
											onChange={e => setTagInput(e.target.value)}
											onKeyDown={e => {
												if (e.key === 'Enter') {
													e.preventDefault();
													addTag(tagInput);
												}
											}}
											className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
											placeholder='Add tag...'
										/>
										<Button
											type='button'
											variant='secondary'
											size='sm'
											onClick={() => addTag(tagInput)}
										>
											<Tag className='w-4 h-4' />
										</Button>
									</div>
									{existingTags.length > 0 && (
										<div className='space-y-2 mt-2'>
											<div className='flex flex-wrap gap-1'>
												{existingTags
													.filter((t: any) => !formData.tags.includes(t.name))
													.slice(0, 5)
													.map((tag: any) => (
														<button
															key={tag.id}
															type='button'
															onClick={() => addTag(tag.name)}
															className='text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600'
														>
															+ {tag.name}
														</button>
													))}
											</div>
											<div className='max-h-28 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2'>
												<div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
													{existingTags.map((tag: any) => {
														const isSelected = formData.tags.includes(tag.name);
														return (
															<button
																key={`multi-${tag.id}`}
																type='button'
																onClick={() => toggleExistingTag(tag.name)}
																className={`text-left text-xs px-2 py-1 rounded border ${
																	isSelected
																		? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
																		: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
																}`}
															>
																{isSelected ? '✓ ' : ''}
																{tag.name}
															</button>
														);
													})}
												</div>
											</div>
										</div>
									)}
								</div>

								<div>
									<label className='block text-sm font-medium mb-1'>
										Google Drive Backup Folder ID (optional)
									</label>
									<input
										type='text'
										value={formData.gdrive_backups_folder_id}
										onChange={e =>
											updateForm('gdrive_backups_folder_id', e.target.value)
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='Drive folder ID (not full URL)'
									/>
								</div>

								<div className='space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3'>
									<label className='flex items-center gap-2 text-sm font-medium'>
										<input
											type='checkbox'
											checked={formData.auto_create_schedule}
											onChange={e =>
												updateForm('auto_create_schedule', e.target.checked)
											}
										/>
										Create backup schedule now
									</label>
									{formData.auto_create_schedule && (
										<div className='grid grid-cols-3 gap-2'>
											<select
												value={formData.schedule_frequency}
												onChange={e =>
													updateForm('schedule_frequency', e.target.value)
												}
												className='px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm'
											>
												<option value='hourly'>Hourly</option>
												<option value='daily'>Daily</option>
												<option value='weekly'>Weekly</option>
												<option value='monthly'>Monthly</option>
											</select>
											<input
												type='number'
												min={0}
												max={23}
												value={formData.schedule_hour}
												onChange={e =>
													updateForm('schedule_hour', Number(e.target.value))
												}
												className='px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm'
											/>
											<input
												type='number'
												min={0}
												max={59}
												value={formData.schedule_minute}
												onChange={e =>
													updateForm('schedule_minute', Number(e.target.value))
												}
												className='px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm'
											/>
										</div>
									)}
								</div>

								<Button
									onClick={handleSubmit}
									disabled={
										createMutation.isPending ||
										isHydratingEnv ||
										!formData.name.trim()
									}
									className='w-full'
									variant='primary'
								>
									{createMutation.isPending || isHydratingEnv ? (
										<>
											<Loader2 className='w-4 h-4 animate-spin mr-2' />
											{isHydratingEnv ? 'Hydrating .env...' : 'Creating...'}
										</>
									) : (
										<>
											<Check className='w-4 h-4 mr-2' />
											Import Project
										</>
									)}
								</Button>
							</div>
						</Card>
					)}
				</div>
			</div>
		</div>
	);

	// Render create mode (manual form)
	const renderCreateMode = () => (
		<div className='space-y-6'>
			{/* Back button */}
			<button
				onClick={() => setWizardFormData(INITIAL_FORM_DATA)}
				className='flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
			>
				<ArrowLeft className='w-4 h-4' />
				Back to options
			</button>

			<div className='max-w-2xl mx-auto'>
				<Card className='p-6'>
					<h3 className='text-xl font-semibold mb-6 flex items-center gap-2'>
						<Plus className='w-6 h-6' />
						Create New Project
					</h3>

					<div className='space-y-6'>
						{/* Basic Info */}
						<div className='space-y-4'>
							<div>
								<label className='block text-sm font-medium mb-1'>
									Project Name *
								</label>
								<input
									type='text'
									value={formData.name}
									onChange={e => updateForm('name', e.target.value)}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
									placeholder='my-new-project'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium mb-1'>Domain</label>
								<input
									type='text'
									value={formData.domain}
									onChange={e => updateForm('domain', e.target.value)}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
									placeholder='example.com'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium mb-1'>
									Site Title
								</label>
								<input
									type='text'
									value={formData.site_title}
									onChange={e => updateForm('site_title', e.target.value)}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
									placeholder='My Website'
								/>
							</div>

							<div>
								<label className='block text-sm font-medium mb-1'>
									Description
								</label>
								<textarea
									value={formData.description}
									onChange={e => updateForm('description', e.target.value)}
									className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
									rows={3}
									placeholder='Brief description of this project'
								/>
							</div>
						</div>

						{/* Deploy Method */}
						<div>
							<label className='block text-sm font-medium mb-3'>
								Deployment Method
							</label>
							<div className='grid grid-cols-3 gap-3'>
								<button
									type='button'
									onClick={() => updateForm('deploy_method', 'existing')}
									className={`p-3 rounded-lg border-2 text-center transition-all ${
										formData.deploy_method === 'existing'
											? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
											: 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
									}`}
								>
									<FolderKanban className='w-6 h-6 mx-auto mb-1' />
									<span className='text-sm'>Track Only</span>
								</button>
								<button
									type='button'
									onClick={() => updateForm('deploy_method', 'github')}
									className={`p-3 rounded-lg border-2 text-center transition-all ${
										formData.deploy_method === 'github'
											? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
											: 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
									}`}
								>
									<Github className='w-6 h-6 mx-auto mb-1' />
									<span className='text-sm'>GitHub</span>
								</button>
								<button
									type='button'
									onClick={() => updateForm('deploy_method', 'blank')}
									className={`p-3 rounded-lg border-2 text-center transition-all ${
										formData.deploy_method === 'blank'
											? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
											: 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
									}`}
								>
									<Cloud className='w-6 h-6 mx-auto mb-1' />
									<span className='text-sm'>Blank</span>
								</button>
							</div>
						</div>

						{/* GitHub Options */}
						{formData.deploy_method === 'github' && (
							<div className='space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50'>
								<h4 className='font-medium flex items-center gap-2'>
									<Github className='w-4 h-4' />
									GitHub Repository
								</h4>
								<div>
									<label className='block text-sm font-medium mb-1'>
										Repository URL
									</label>
									<input
										type='text'
										value={formData.github_repo_url}
										onChange={e =>
											updateForm('github_repo_url', e.target.value)
										}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='https://github.com/user/repo'
									/>
								</div>
								<div>
									<label className='block text-sm font-medium mb-1'>
										Branch
									</label>
									<input
										type='text'
										value={formData.github_branch}
										onChange={e => updateForm('github_branch', e.target.value)}
										className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
										placeholder='main'
									/>
								</div>
							</div>
						)}

						{/* Tags */}
						<div>
							<label className='block text-sm font-medium mb-1'>Tags</label>
							<div className='flex flex-wrap gap-2 mb-2'>
								{formData.tags.map(tag => (
									<span
										key={tag}
										className='inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600'
										onClick={() => removeTag(tag)}
									>
										{tag} ×
									</span>
								))}
							</div>
							<div className='flex gap-2'>
								<input
									type='text'
									value={tagInput}
									onChange={e => setTagInput(e.target.value)}
									onKeyDown={e => {
										if (e.key === 'Enter') {
											e.preventDefault();
											addTag(tagInput);
										}
									}}
									className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
									placeholder='Add tag...'
								/>
								<Button
									type='button'
									variant='secondary'
									size='sm'
									onClick={() => addTag(tagInput)}
								>
									<Tag className='w-4 h-4' />
								</Button>
							</div>
							{existingTags.length > 0 && (
								<div className='space-y-2 mt-2'>
									<div className='flex flex-wrap gap-1'>
										{existingTags
											.filter((t: any) => !formData.tags.includes(t.name))
											.slice(0, 5)
											.map((tag: any) => (
												<button
													key={tag.id}
													type='button'
													onClick={() => addTag(tag.name)}
													className='text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600'
												>
													+ {tag.name}
												</button>
											))}
									</div>
									<div className='max-h-28 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2'>
										<div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
											{existingTags.map((tag: any) => {
												const isSelected = formData.tags.includes(tag.name);
												return (
													<button
														key={`create-multi-${tag.id}`}
														type='button'
														onClick={() => toggleExistingTag(tag.name)}
														className={`text-left text-xs px-2 py-1 rounded border ${
															isSelected
																? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
																: 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
														}`}
													>
														{isSelected ? '✓ ' : ''}
														{tag.name}
													</button>
												);
											})}
										</div>
									</div>
								</div>
							)}
						</div>

						{/* Advanced Options Toggle */}
						<button
							type='button'
							onClick={() => setShowAdvanced(!showAdvanced)}
							className='flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
						>
							<Info className='w-4 h-4' />
							{showAdvanced ? 'Hide' : 'Show'} Advanced Options
						</button>

						{showAdvanced && (
							<div className='space-y-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-800/50'>
								<h4 className='font-medium'>CyberPanel Options</h4>

								<label className='flex items-center gap-2'>
									<input
										type='checkbox'
										checked={formData.create_on_cyberpanel}
										onChange={e =>
											updateForm('create_on_cyberpanel', e.target.checked)
										}
										className='rounded border-gray-300'
									/>
									<span className='text-sm'>Create website on CyberPanel</span>
								</label>

								{formData.create_on_cyberpanel && (
									<div className='space-y-4 ml-6'>
										<div>
											<label className='block text-sm font-medium mb-1'>
												Server
											</label>
											<select
												value={formData.server_id || ''}
												onChange={e =>
													updateForm(
														'server_id',
														e.target.value ? Number(e.target.value) : null,
													)
												}
												className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
											>
												<option value=''>Select server...</option>
												{servers
													.filter((s: any) => s.panel_type === 'cyberpanel')
													.map((server: any) => (
														<option key={server.id} value={server.id}>
															{server.name}
														</option>
													))}
											</select>
										</div>

										<div>
											<label className='block text-sm font-medium mb-1'>
												PHP Version
											</label>
											<select
												value={formData.php_version}
												onChange={e =>
													updateForm('php_version', e.target.value)
												}
												className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800'
											>
												<option value='8.3'>PHP 8.3</option>
												<option value='8.2'>PHP 8.2</option>
												<option value='8.1'>PHP 8.1</option>
												<option value='8.0'>PHP 8.0</option>
											</select>
										</div>

										<label className='flex items-center gap-2'>
											<input
												type='checkbox'
												checked={formData.create_database}
												onChange={e =>
													updateForm('create_database', e.target.checked)
												}
												className='rounded border-gray-300'
											/>
											<span className='text-sm'>Create database</span>
										</label>

										<label className='flex items-center gap-2'>
											<input
												type='checkbox'
												checked={formData.issue_ssl}
												onChange={e =>
													updateForm('issue_ssl', e.target.checked)
												}
												className='rounded border-gray-300'
											/>
											<span className='text-sm'>Issue SSL certificate</span>
										</label>
									</div>
								)}
							</div>
						)}

						<Button
							onClick={handleSubmit}
							disabled={createMutation.isPending || !formData.name.trim()}
							className='w-full'
							variant='primary'
							size='lg'
						>
							{createMutation.isPending ? (
								<>
									<Loader2 className='w-4 h-4 animate-spin mr-2' />
									Creating...
								</>
							) : (
								<>
									<Check className='w-4 h-4 mr-2' />
									Create Project
								</>
							)}
						</Button>
					</div>
				</Card>
			</div>
		</div>
	);

	return (
		<div className='max-w-6xl mx-auto p-6'>
			<div className='mb-8'>
				<button
					onClick={() => navigate('/projects')}
					className='flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4'
				>
					<ArrowLeft className='w-4 h-4' />
					Back to Projects
				</button>
				<h1 className='text-3xl font-bold text-gray-900 dark:text-white'>
					Add Project
				</h1>
			</div>

			{formData.mode === 'choose' && renderChooseMode()}
			{formData.mode === 'import' && renderImportMode()}
			{formData.mode === 'create' && renderCreateMode()}
		</div>
	);
}
