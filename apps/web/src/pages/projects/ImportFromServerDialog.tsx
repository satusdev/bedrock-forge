/**
 * ImportFromServerDialog
 *
 * 3-step wizard for importing WordPress/Bedrock projects from a server:
 *   Step 1 — Select a server and trigger the SSH auto-scan
 *   Step 2 — Review discovered projects, assign clients, select which to import
 *   Step 3 — Show per-project import results with links to created projects
 */
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
	Loader2,
	Check,
	X,
	Server as ServerIcon,
	AlertTriangle,
	Database,
	Globe,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Server {
	id: number;
	name: string;
	ip_address: string;
}

interface Client {
	id: number;
	name: string;
}

interface ScannedProject {
	path: string;
	name: string;
	isBedrock: boolean;
	isWordPress: boolean;
	siteUrl?: string;
	hasDbCredentials: boolean;
	dbCredentials?: {
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	};
	mainDomain?: string;
	alreadyImported: boolean;
	existingProjectId?: string;
	serverId: number;
	serverName: string;
}

/** Mutable per-row state layered on top of ScannedProject */
interface RowState {
	selected: boolean;
	name: string;
	clientId: string; // string for Select value binding
}

interface ImportResult {
	path: string;
	name: string;
	success: boolean;
	projectId?: string;
	error?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeBadge({
	isBedrock,
	isWordPress,
}: {
	isBedrock: boolean;
	isWordPress: boolean;
}) {
	if (isBedrock)
		return (
			<Badge
				variant='secondary'
				className='text-blue-400 border-blue-400/30 bg-blue-400/10 whitespace-nowrap'
			>
				Bedrock WP
			</Badge>
		);
	if (isWordPress)
		return (
			<Badge variant='secondary' className='whitespace-nowrap'>
				WordPress
			</Badge>
		);
	return (
		<Badge
			variant='secondary'
			className='text-muted-foreground whitespace-nowrap'
		>
			Unknown
		</Badge>
	);
}

// ─── Step 1: Server Selection ─────────────────────────────────────────────────

function StepSelectServer({
	onScanned,
}: {
	onScanned: (projects: ScannedProject[]) => void;
}) {
	const [selectedIds, setSelectedIds] = useState<number[]>([]);
	const [scanning, setScanning] = useState(false);
	const [error, setError] = useState('');

	const { data: servers = [], isLoading } = useQuery({
		queryKey: ['servers-list'],
		queryFn: () =>
			api.get<{ items: Server[] }>('/servers?limit=100').then(r => r.items),
	});

	function toggleServer(id: number) {
		setSelectedIds(prev =>
			prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
		);
	}

	const handleScan = async () => {
		if (selectedIds.length === 0) {
			setError('Select at least one server.');
			return;
		}
		setScanning(true);
		setError('');
		try {
			const results = await api.post<ScannedProject[]>(
				'/servers/scan-projects-multi',
				{ serverIds: selectedIds },
			);
			if (results.length === 0) {
				setError(
					'No WordPress or Bedrock projects found under /home/*/public_html on the selected servers.',
				);
				setScanning(false);
				return;
			}
			onScanned(results);
		} catch (err: unknown) {
			setError(
				err instanceof Error
					? err.message
					: 'Scan failed. Check server SSH connectivity.',
			);
		} finally {
			setScanning(false);
		}
	};

	return (
		<div className='space-y-5 py-2'>
			<p className='text-sm text-muted-foreground'>
				Select one or more servers to auto-scan{' '}
				<code className='text-xs'>/home/*/public_html</code> for WordPress and
				Bedrock installations via SSH.
			</p>

			<div className='space-y-2'>
				<Label>Servers</Label>
				{isLoading ? (
					<div className='flex items-center gap-2 text-sm text-muted-foreground py-2'>
						<Loader2 className='h-4 w-4 animate-spin' />
						Loading servers…
					</div>
				) : servers.length === 0 ? (
					<p className='text-sm text-muted-foreground py-2'>
						No servers configured. Add a server first.
					</p>
				) : (
					<div className='border rounded-md divide-y max-h-60 overflow-y-auto'>
						{servers.map(s => (
							<label
								key={s.id}
								className='flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors'
							>
								<input
									type='checkbox'
									className='h-4 w-4 rounded border-input'
									checked={selectedIds.includes(s.id)}
									onChange={() => toggleServer(s.id)}
								/>
								<ServerIcon className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
								<span className='flex-1 text-sm font-medium'>{s.name}</span>
								<span className='text-xs text-muted-foreground'>
									{s.ip_address}
								</span>
							</label>
						))}
					</div>
				)}
			</div>

			{error && (
				<div className='flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive'>
					<AlertTriangle className='h-4 w-4 mt-0.5 shrink-0' />
					<span>{error}</span>
				</div>
			)}

			<DialogFooter>
				<Button
					type='button'
					onClick={handleScan}
					disabled={
						scanning || selectedIds.length === 0 || servers.length === 0
					}
					className='w-full sm:w-auto'
				>
					{scanning ? (
						<>
							<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							Scanning {selectedIds.length} server
							{selectedIds.length !== 1 ? 's' : ''}…
						</>
					) : (
						<>
							<ServerIcon className='h-4 w-4 mr-2' />
							Scan {selectedIds.length > 0 ? `${selectedIds.length} ` : ''}
							Server{selectedIds.length !== 1 ? 's' : ''}
						</>
					)}
				</Button>
			</DialogFooter>
		</div>
	);
}

// ─── Step 2: Review & Select ──────────────────────────────────────────────────

function StepReviewProjects({
	projects,
	clients,
	onImported,
	onBack,
}: {
	projects: ScannedProject[];
	clients: Client[];
	onImported: (results: ImportResult[]) => void;
	onBack: () => void;
}) {
	const [rows, setRows] = useState<RowState[]>(() =>
		projects.map(p => ({
			selected: !p.alreadyImported,
			name: p.name,
			clientId: '',
		})),
	);
	const [importing, setImporting] = useState(false);

	const importable = projects.filter(p => !p.alreadyImported);
	const selectedRows = rows.filter(
		(r, i) => !projects[i].alreadyImported && r.selected,
	);

	const allSelectableSelected =
		importable.length > 0 &&
		importable.every((_, idx) => {
			const realIdx = projects.indexOf(importable[idx]);
			return rows[realIdx]?.selected;
		});

	const handleToggleAll = () => {
		const next = !allSelectableSelected;
		setRows(prev =>
			prev.map((r, i) =>
				projects[i].alreadyImported ? r : { ...r, selected: next },
			),
		);
	};

	const updateRow = useCallback((idx: number, patch: Partial<RowState>) => {
		setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
	}, []);

	const missingClient = selectedRows.some(r => !r.clientId);

	const handleImport = async () => {
		setImporting(true);
		const toImport = projects
			.map((p, i) => ({ project: p, row: rows[i] }))
			.filter(({ project, row }) => !project.alreadyImported && row.selected);

		const payload = {
			projects: toImport.map(({ project, row }) => ({
				server_id: project.serverId,
				name: row.name,
				root_path: project.path,
				url: project.siteUrl ?? '',
				type: 'production',
				client_id: parseInt(row.clientId, 10),
				...(project.mainDomain && { main_domain: project.mainDomain }),
				...(project.dbCredentials && { db_credentials: project.dbCredentials }),
			})),
		};

		try {
			const results = await api.post<
				Array<{
					project: { id: number; name: string };
					environment: { id: number };
				}>
			>('/projects/import-bulk', payload);

			const importResults: ImportResult[] = toImport.map(
				({ project, row }, idx) => ({
					path: project.path,
					name: row.name,
					success: true,
					projectId: String(results[idx]?.project.id),
				}),
			);

			onImported(importResults);
		} catch (err: unknown) {
			toast({
				title: 'Import failed',
				description: err instanceof Error ? err.message : 'Unknown error',
				variant: 'destructive',
			});
		} finally {
			setImporting(false);
		}
	};

	const newCount = projects.filter(p => !p.alreadyImported).length;
	const alreadyCount = projects.filter(p => p.alreadyImported).length;

	return (
		<div className='flex flex-col gap-4'>
			{/* Summary bar */}
			<div className='flex items-center gap-3 text-sm text-muted-foreground'>
				<span>
					<span className='font-medium text-foreground'>{projects.length}</span>{' '}
					projects found
				</span>
				{alreadyCount > 0 && (
					<span className='text-muted-foreground'>
						· {alreadyCount} already imported
					</span>
				)}
				{newCount > 0 && (
					<span className='text-green-400'>· {newCount} new</span>
				)}
			</div>

			{/* Table */}
			<div className='rounded-md border overflow-hidden'>
				<div className='overflow-y-auto max-h-[52vh]'>
					<table className='w-full text-sm'>
						<thead className='sticky top-0 z-10 bg-muted/80 backdrop-blur-sm'>
							<tr className='border-b'>
								<th className='px-3 py-2.5 w-9 text-left'>
									{newCount > 0 && (
										<input
											type='checkbox'
											checked={allSelectableSelected}
											onChange={handleToggleAll}
											className='h-4 w-4 rounded border-border cursor-pointer accent-primary'
											aria-label='Select all importable projects'
										/>
									)}
								</th>
								<th className='px-3 py-2.5 text-left font-medium text-muted-foreground w-48'>
									Name
								</th>
								<th className='px-3 py-2.5 text-left font-medium text-muted-foreground'>
									Path
								</th>
								<th className='px-3 py-2.5 text-left font-medium text-muted-foreground w-28'>
									Server
								</th>
								<th className='px-3 py-2.5 text-left font-medium text-muted-foreground w-28'>
									Type
								</th>
								<th
									className='px-3 py-2.5 text-center font-medium text-muted-foreground w-10'
									title='DB credentials detected'
								>
									<Database className='h-3.5 w-3.5 mx-auto' />
								</th>
								<th className='px-3 py-2.5 text-left font-medium text-muted-foreground w-44'>
									Client *
								</th>
							</tr>
						</thead>
						<tbody className='divide-y divide-border'>
							{projects.map((project, idx) => {
								const row = rows[idx];
								const isDisabled = project.alreadyImported;
								return (
									<tr
										key={project.path}
										className={`transition-colors ${
											isDisabled
												? 'opacity-40 bg-muted/20'
												: row.selected
													? 'bg-primary/5'
													: ''
										}`}
									>
										{/* Checkbox */}
										<td className='px-3 py-2'>
											{isDisabled ? (
												<span
													title='Already imported'
													className='inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted'
												>
													<Check className='h-2.5 w-2.5 text-muted-foreground' />
												</span>
											) : (
												<input
													type='checkbox'
													checked={row.selected}
													onChange={e =>
														updateRow(idx, { selected: e.target.checked })
													}
													className='h-4 w-4 rounded border-border cursor-pointer accent-primary'
												/>
											)}
										</td>

										{/* Name (editable) */}
										<td className='px-3 py-2'>
											{isDisabled ? (
												<span className='text-muted-foreground'>
													{project.name}
												</span>
											) : (
												<Input
													value={row.name}
													onChange={e =>
														updateRow(idx, { name: e.target.value })
													}
													className='h-7 text-xs px-2'
													disabled={!row.selected}
												/>
											)}
										</td>

										{/* Path */}
										<td className='px-3 py-2'>
											<span
												className='text-xs text-muted-foreground font-mono truncate block max-w-[220px]'
												title={project.path}
											>
												{project.path}
											</span>
											{project.siteUrl && (
												<span className='flex items-center gap-1 text-xs text-muted-foreground mt-0.5'>
													<Globe className='h-3 w-3 shrink-0' />
													<span className='truncate max-w-[200px]'>
														{project.siteUrl}
													</span>
												</span>
											)}
										</td>

										{/* Type badge */}
										<td className='px-3 py-2'>
											{' '}
											<span className='text-xs text-muted-foreground'>
												{project.serverName}
											</span>
										</td>
										{/* Type badge */}
										<td className='px-3 py-2'>
											{' '}
											<TypeBadge
												isBedrock={project.isBedrock}
												isWordPress={project.isWordPress}
											/>
											{project.alreadyImported && (
												<Badge
													variant='secondary'
													className='mt-1 text-xs text-muted-foreground'
												>
													Imported
												</Badge>
											)}
										</td>

										{/* DB detected */}
										<td className='px-3 py-2 text-center'>
											{project.hasDbCredentials ? (
												<span
													title={`DB: ${project.dbCredentials?.dbName} @ ${project.dbCredentials?.dbHost} (user: ${project.dbCredentials?.dbUser})`}
													className='cursor-help inline-flex'
												>
													<Check className='h-4 w-4 text-green-500 mx-auto' />
												</span>
											) : (
												<span className='text-muted-foreground text-xs'>—</span>
											)}
										</td>

										{/* Client dropdown */}
										<td className='px-3 py-2'>
											{isDisabled ? (
												<span className='text-xs text-muted-foreground'>—</span>
											) : (
												<Select
													value={row.clientId}
													onValueChange={v => updateRow(idx, { clientId: v })}
													disabled={!row.selected}
												>
													<SelectTrigger className='h-7 text-xs'>
														<SelectValue placeholder='Select…' />
													</SelectTrigger>
													<SelectContent>
														{clients.map(c => (
															<SelectItem
																key={c.id}
																value={String(c.id)}
																className='text-xs'
															>
																{c.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>

			{/* Validation hint */}
			{selectedRows.length > 0 && missingClient && (
				<p className='text-xs text-destructive flex items-center gap-1.5'>
					<AlertTriangle className='h-3.5 w-3.5 shrink-0' />
					Assign a client to every selected project before importing.
				</p>
			)}

			<DialogFooter className='flex-col-reverse sm:flex-row gap-2'>
				<Button type='button' variant='outline' onClick={onBack}>
					Back
				</Button>
				<Button
					type='button'
					onClick={handleImport}
					disabled={importing || selectedRows.length === 0 || missingClient}
				>
					{importing ? (
						<>
							<Loader2 className='h-4 w-4 mr-2 animate-spin' />
							Importing…
						</>
					) : (
						`Import ${selectedRows.length} Project${selectedRows.length !== 1 ? 's' : ''}`
					)}
				</Button>
			</DialogFooter>
		</div>
	);
}

// ─── Step 3: Results ──────────────────────────────────────────────────────────

function StepResults({
	results,
	onClose,
}: {
	results: ImportResult[];
	onClose: () => void;
}) {
	const navigate = useNavigate();
	const successes = results.filter(r => r.success);
	const failures = results.filter(r => !r.success);

	return (
		<div className='space-y-4 py-2'>
			<div className='flex items-center gap-3 text-sm'>
				{successes.length > 0 && (
					<span className='text-green-400 font-medium'>
						{successes.length} imported successfully
					</span>
				)}
				{failures.length > 0 && (
					<span className='text-destructive font-medium'>
						{failures.length} failed
					</span>
				)}
			</div>

			<div className='rounded-md border divide-y divide-border overflow-hidden'>
				{results.map(result => (
					<div key={result.path} className='flex items-center gap-3 px-4 py-3'>
						{result.success ? (
							<Check className='h-4 w-4 text-green-500 shrink-0' />
						) : (
							<X className='h-4 w-4 text-destructive shrink-0' />
						)}
						<div className='flex-1 min-w-0'>
							<p className='font-medium text-sm truncate'>{result.name}</p>
							<p className='text-xs text-muted-foreground font-mono truncate'>
								{result.path}
							</p>
							{result.error && (
								<p className='text-xs text-destructive mt-0.5'>
									{result.error}
								</p>
							)}
						</div>
						{result.success && result.projectId && (
							<Button
								variant='outline'
								size='sm'
								className='shrink-0 h-7 text-xs'
								onClick={() => navigate(`/projects/${result.projectId}`)}
							>
								View
							</Button>
						)}
					</div>
				))}
			</div>

			<DialogFooter>
				<Button onClick={onClose}>Close</Button>
			</DialogFooter>
		</div>
	);
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

type Step = 'select-server' | 'review' | 'results';

export function ImportFromServerDialog({
	open,
	onOpenChange,
	clients,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	clients: Client[];
	onSuccess: () => void;
}) {
	const [step, setStep] = useState<Step>('select-server');
	const [scannedProjects, setScannedProjects] = useState<ScannedProject[]>([]);
	const [importResults, setImportResults] = useState<ImportResult[]>([]);

	const reset = () => {
		setStep('select-server');
		setScannedProjects([]);
		setImportResults([]);
	};

	const handleClose = (o: boolean) => {
		if (!o) {
			if (step === 'results') onSuccess();
			reset();
		}
		onOpenChange(o);
	};

	const handleScanned = (projects: ScannedProject[]) => {
		setScannedProjects(projects);
		setStep('review');
	};

	const handleImported = (results: ImportResult[]) => {
		setImportResults(results);
		setStep('results');
		onSuccess();
	};

	const stepTitle: Record<Step, string> = {
		'select-server': 'Import Projects from Server',
		review: 'Review Discovered Projects',
		results: 'Import Complete',
	};

	const isWide = step === 'review' || step === 'results';

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent
				className={`${isWide ? 'max-w-4xl w-full' : 'max-w-md'} transition-all`}
			>
				<DialogHeader>
					<DialogTitle className='flex items-center gap-2'>
						<ServerIcon className='h-4 w-4 text-muted-foreground' />
						{stepTitle[step]}
					</DialogTitle>
				</DialogHeader>

				{step === 'select-server' && (
					<StepSelectServer onScanned={handleScanned} />
				)}

				{step === 'review' && (
					<StepReviewProjects
						projects={scannedProjects}
						clients={clients}
						onImported={handleImported}
						onBack={() => setStep('select-server')}
					/>
				)}

				{step === 'results' && (
					<StepResults
						results={importResults}
						onClose={() => handleClose(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
