import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, Layers } from 'lucide-react';
import { WS_EVENTS } from '@bedrock-forge/shared';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface Client {
	id: number;
	name: string;
}

interface Server {
	id: number;
	name: string;
	ip_address: string;
}

interface ProjectEnv {
	id: number;
	url: string | null;
	type: string;
}

interface ProjectOption {
	id: number;
	name: string;
	environments: ProjectEnv[];
}

interface CreateFullResponse {
	project: { id: number; name: string };
	environment: { id: number; url: string | null };
	jobExecutionId: number;
	jobId: string;
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

const PHP_VERSIONS = ['8.1', '8.2', '8.3'] as const;

export function CreateBedrockDialog({ open, onOpenChange, onSuccess }: Props) {
	const navigate = useNavigate();

	// Mode
	const [mode, setMode] = useState<'fresh' | 'clone'>('fresh');

	// Form fields
	const [name, setName] = useState('');
	const [clientId, setClientId] = useState('');
	const [serverId, setServerId] = useState('');
	const [domain, setDomain] = useState('');
	const [adminEmail, setAdminEmail] = useState('');
	const [phpVersion, setPhpVersion] = useState('8.3');
	const [sourceProjectId, setSourceProjectId] = useState('');
	const [sourceEnvId, setSourceEnvId] = useState('');

	// Job tracking state
	const [jobId, setJobId] = useState<string | null>(null);
	const [environmentId, setEnvironmentId] = useState<number | null>(null);
	const [projectId, setProjectId] = useState<number | null>(null);
	const [progress, setProgress] = useState(0);
	const [progressMsg, setProgressMsg] = useState('');
	const [jobDone, setJobDone] = useState<'completed' | 'failed' | null>(null);
	const [jobError, setJobError] = useState<string | null>(null);

	// Subscribe to WS room for environment once we have it
	useSubscribeEnvironment(environmentId ?? 0);

	useWebSocketEvent(WS_EVENTS.JOB_PROGRESS, (raw: unknown) => {
		const d = raw as {
			jobId: string;
			queueName: string;
			progress: number;
			step?: string;
		};
		if (d.queueName !== 'projects' || d.jobId !== jobId) return;
		setProgress(d.progress ?? 0);
		if (d.step) setProgressMsg(d.step);
	});

	useWebSocketEvent(WS_EVENTS.JOB_COMPLETED, (raw: unknown) => {
		const d = raw as { jobId: string; queueName: string };
		if (d.queueName !== 'projects' || d.jobId !== jobId) return;
		setJobDone('completed');
		setProgress(100);
		onSuccess();
		toast({ title: 'Bedrock project created successfully!' });
	});

	useWebSocketEvent(WS_EVENTS.JOB_FAILED, (raw: unknown) => {
		const d = raw as { jobId: string; queueName: string; error?: string };
		if (d.queueName !== 'projects' || d.jobId !== jobId) return;
		setJobDone('failed');
		setJobError(d.error ?? 'An unexpected error occurred');
		toast({
			title: 'Bedrock creation failed',
			description: d.error,
			variant: 'destructive',
		});
	});

	// Data queries
	const { data: clients } = useQuery({
		queryKey: ['clients-list'],
		queryFn: () =>
			api.get<{ items: Client[] }>('/clients?limit=100').then(r => r.items),
		enabled: open,
	});

	const { data: servers } = useQuery({
		queryKey: ['servers-list'],
		queryFn: () =>
			api.get<{ items: Server[] }>('/servers?limit=100').then(r => r.items),
		enabled: open,
	});

	const { data: projects } = useQuery({
		queryKey: ['projects-list-for-clone'],
		queryFn: () =>
			api
				.get<{ items: ProjectOption[] }>('/projects?limit=100')
				.then(r => r.items),
		enabled: open && mode === 'clone',
	});

	const sourceProject = projects?.find(
		p => p.id === parseInt(sourceProjectId, 10),
	);

	// Submit mutation
	const mutation = useMutation({
		mutationFn: (body: object) =>
			api.post<CreateFullResponse>('/projects/create-full', body),
		onSuccess: res => {
			setJobId(res.jobId);
			setEnvironmentId(res.environment.id);
			setProjectId(res.project.id);
			setProgress(0);
			setProgressMsg('Starting...');
		},
		onError: (err: unknown) => {
			const msg =
				err && typeof err === 'object' && 'message' in err
					? String((err as { message: unknown }).message)
					: 'Failed to start Bedrock creation';
			toast({ title: 'Error', description: msg, variant: 'destructive' });
		},
	});

	function handleSubmit() {
		if (!name || !clientId || !serverId || !domain || !adminEmail) {
			toast({
				title: 'Missing fields',
				description: 'Please fill in all required fields.',
				variant: 'destructive',
			});
			return;
		}
		if (mode === 'clone' && !sourceEnvId) {
			toast({
				title: 'Missing source',
				description: 'Select a source environment to clone from.',
				variant: 'destructive',
			});
			return;
		}

		const body: Record<string, unknown> = {
			name,
			client_id: parseInt(clientId, 10),
			server_id: parseInt(serverId, 10),
			domain,
			admin_email: adminEmail,
			php_version: phpVersion,
		};
		if (mode === 'clone') {
			body.source_environment_id = parseInt(sourceEnvId, 10);
		}

		mutation.mutate(body);
	}

	function handleNavigate() {
		if (projectId) navigate(`/projects/${projectId}`);
	}

	function handleClose() {
		if (mutation.isPending) return;
		onOpenChange(false);
		// Reset after close animation
		setTimeout(reset, 200);
	}

	function reset() {
		setMode('fresh');
		setName('');
		setClientId('');
		setServerId('');
		setDomain('');
		setAdminEmail('');
		setPhpVersion('8.3');
		setSourceProjectId('');
		setSourceEnvId('');
		setJobId(null);
		setEnvironmentId(null);
		setProjectId(null);
		setProgress(0);
		setProgressMsg('');
		setJobDone(null);
		setJobError(null);
		mutation.reset();
	}

	// Reset source env when project changes
	useEffect(() => {
		setSourceEnvId('');
	}, [sourceProjectId]);

	const isRunning = !!jobId && !jobDone;
	const isSubmitted = !!jobId;
	const isBusy = mutation.isPending || isRunning;

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className='max-w-lg'>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<Layers className='h-5 w-5' />
						Create Bedrock Project
					</DialogTitle>
				</DialogHeader>

				{!isSubmitted ? (
					<div className='space-y-4 py-2'>
						{/* Mode tabs */}
						<div className='flex gap-2'>
							<Button
								size='sm'
								variant={mode === 'fresh' ? 'default' : 'outline'}
								onClick={() => setMode('fresh')}
							>
								Fresh Bedrock
							</Button>
							<Button
								size='sm'
								variant={mode === 'clone' ? 'default' : 'outline'}
								onClick={() => setMode('clone')}
							>
								Clone from Existing
							</Button>
						</div>

						{/* Project Name */}
						<div className='space-y-1.5'>
							<Label htmlFor='bf-name'>
								Project Name <span className='text-destructive'>*</span>
							</Label>
							<Input
								id='bf-name'
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder='My WordPress Site'
							/>
						</div>

						{/* Client */}
						<div className='space-y-1.5'>
							<Label>
								Client <span className='text-destructive'>*</span>
							</Label>
							<Select value={clientId} onValueChange={setClientId}>
								<SelectTrigger>
									<SelectValue placeholder='Select client…' />
								</SelectTrigger>
								<SelectContent>
									{clients?.map(c => (
										<SelectItem key={c.id} value={String(c.id)}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Server */}
						<div className='space-y-1.5'>
							<Label>
								Server <span className='text-destructive'>*</span>
							</Label>
							<Select value={serverId} onValueChange={setServerId}>
								<SelectTrigger>
									<SelectValue placeholder='Select server…' />
								</SelectTrigger>
								<SelectContent>
									{servers?.map(s => (
										<SelectItem key={s.id} value={String(s.id)}>
											{s.name} ({s.ip_address})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Domain */}
						<div className='space-y-1.5'>
							<Label htmlFor='bf-domain'>
								Domain <span className='text-destructive'>*</span>
							</Label>
							<Input
								id='bf-domain'
								value={domain}
								onChange={e => setDomain(e.target.value)}
								placeholder='example.com'
							/>
						</div>

						{/* Admin Email */}
						<div className='space-y-1.5'>
							<Label htmlFor='bf-email'>
								Admin Email <span className='text-destructive'>*</span>
							</Label>
							<Input
								id='bf-email'
								type='email'
								value={adminEmail}
								onChange={e => setAdminEmail(e.target.value)}
								placeholder='admin@example.com'
							/>
						</div>

						{/* PHP Version */}
						<div className='space-y-1.5'>
							<Label>PHP Version</Label>
							<Select value={phpVersion} onValueChange={setPhpVersion}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PHP_VERSIONS.map(v => (
										<SelectItem key={v} value={v}>
											PHP {v}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Clone source */}
						{mode === 'clone' && (
							<>
								<div className='space-y-1.5'>
									<Label>
										Source Project <span className='text-destructive'>*</span>
									</Label>
									<Select
										value={sourceProjectId}
										onValueChange={setSourceProjectId}
									>
										<SelectTrigger>
											<SelectValue placeholder='Select source project…' />
										</SelectTrigger>
										<SelectContent>
											{projects?.map(p => (
												<SelectItem key={p.id} value={String(p.id)}>
													{p.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								{sourceProject && (
									<div className='space-y-1.5'>
										<Label>
											Source Environment{' '}
											<span className='text-destructive'>*</span>
										</Label>
										<Select value={sourceEnvId} onValueChange={setSourceEnvId}>
											<SelectTrigger>
												<SelectValue placeholder='Select environment…' />
											</SelectTrigger>
											<SelectContent>
												{sourceProject.environments.map(e => (
													<SelectItem key={e.id} value={String(e.id)}>
														{e.type} — {e.url ?? `env #${e.id}`}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
								)}
							</>
						)}
					</div>
				) : (
					/* Progress view */
					<div className='py-4 space-y-4'>
						<div className='space-y-2'>
							<div className='flex justify-between text-sm'>
								<span className='text-muted-foreground'>
									{jobDone === 'completed'
										? 'Completed!'
										: jobDone === 'failed'
											? 'Failed'
											: progressMsg || 'Working…'}
								</span>
								<span className='font-medium'>{progress}%</span>
							</div>
							<div className='h-2 rounded-full bg-muted overflow-hidden'>
								<div
									className={`h-full rounded-full transition-all duration-500 ${
										jobDone === 'failed'
											? 'bg-destructive'
											: jobDone === 'completed'
												? 'bg-green-500'
												: 'bg-primary'
									}`}
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>

						{jobError && <p className='text-sm text-destructive'>{jobError}</p>}

						{jobDone === 'completed' && (
							<p className='text-sm text-muted-foreground'>
								Your Bedrock project has been provisioned and is ready.
							</p>
						)}
					</div>
				)}

				<DialogFooter>
					{!isSubmitted ? (
						<>
							<Button variant='outline' onClick={handleClose} disabled={isBusy}>
								Cancel
							</Button>
							<Button onClick={handleSubmit} disabled={isBusy}>
								{mutation.isPending && (
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
								)}
								Create Project
							</Button>
						</>
					) : jobDone === 'completed' ? (
						<>
							<Button variant='outline' onClick={handleClose}>
								Close
							</Button>
							<Button onClick={handleNavigate}>View Project</Button>
						</>
					) : jobDone === 'failed' ? (
						<>
							<Button variant='outline' onClick={handleClose}>
								Close
							</Button>
							<Button variant='destructive' onClick={reset}>
								Try Again
							</Button>
						</>
					) : (
						<Button variant='outline' disabled>
							<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							Creating…
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
