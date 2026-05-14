import React, { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Shield,
	ServerIcon,
	FolderKanban,
	ListFilter,
	ShieldAlert,
	FileText,
	Lock,
	Monitor,
	RefreshCw,
	Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/crud';
import { api } from '@/lib/api-client';
import type { OverviewData } from './types';
import { ClipboardListIcon } from './components';
import { OverviewTab } from './tabs/OverviewTab';
import { ServerSecurityTab } from './tabs/ServerSecurityTab';
import { ProjectSecurityTab } from './tabs/ProjectSecurityTab';
import { SecurityLogsTab } from './tabs/SecurityLogsTab';
import { RecommendationsTab } from './tabs/RecommendationsTab';
import { FindingsTab } from './tabs/FindingsTab';
import { SecurityReportTab } from './tabs/SecurityReportTab';
import { ForgeSecurityTab } from './tabs/ForgeSecurityTab';
import { SessionsTab } from './tabs/SessionsTab';
import { ServerSchedulesTab, ProjectSchedulesTab } from './tabs/ScheduleTabs';
import { SecurityScanProgress } from './components/SecurityScanProgress';

export function SecurityPage() {
	const queryClient = useQueryClient();

	const { data: overview, isFetching } = useQuery<OverviewData>({
		queryKey: ['security', 'overview'],
		queryFn: () => api.get('/security/overview'),
		refetchInterval: 30_000,
	});

	const handleRefresh = useCallback(() => {
		queryClient.invalidateQueries({ queryKey: ['security'] });
	}, [queryClient]);

	return (
		<div className='space-y-4'>
			<PageHeader title='Security'>
				<Button
					variant='outline'
					size='sm'
					onClick={handleRefresh}
					disabled={isFetching}
				>
					<RefreshCw
						className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`}
					/>
					Refresh
				</Button>
			</PageHeader>

			<SecurityScanProgress />

			<Tabs defaultValue='overview'>
				<TabsList className='flex-wrap h-auto gap-1'>
					<TabsTrigger value='overview'>
						<Shield className='h-3.5 w-3.5 mr-1.5' />
						Overview
					</TabsTrigger>
					<TabsTrigger value='servers'>
						<ServerIcon className='h-3.5 w-3.5 mr-1.5' />
						Servers
					</TabsTrigger>
					<TabsTrigger value='projects'>
						<FolderKanban className='h-3.5 w-3.5 mr-1.5' />
						Projects
					</TabsTrigger>
					<TabsTrigger value='logs'>
						<ClipboardListIcon className='h-3.5 w-3.5 mr-1.5' />
						SSH Logs
					</TabsTrigger>
					<TabsTrigger value='recommendations'>
						<ShieldAlert className='h-3.5 w-3.5 mr-1.5' />
						Recommendations
					</TabsTrigger>
					<TabsTrigger value='findings'>
						<ListFilter className='h-3.5 w-3.5 mr-1.5' />
						Findings
					</TabsTrigger>
					<TabsTrigger value='report'>
						<FileText className='h-3.5 w-3.5 mr-1.5' />
						Report
					</TabsTrigger>
					<TabsTrigger value='schedules'>
						<Clock className='h-3.5 w-3.5 mr-1.5' />
						Schedules
					</TabsTrigger>
					<TabsTrigger value='forge-security'>
						<Lock className='h-3.5 w-3.5 mr-1.5' />
						Forge Security
					</TabsTrigger>
					<TabsTrigger value='sessions'>
						<Monitor className='h-3.5 w-3.5 mr-1.5' />
						Sessions
					</TabsTrigger>
				</TabsList>

				<div className='mt-4'>
					{!overview && isFetching && (
						<div className='flex justify-center py-16'>
							<RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
						</div>
					)}

					{overview && (
						<>
							<TabsContent value='overview'>
								<OverviewTab data={overview} />
							</TabsContent>
							<TabsContent value='servers'>
								<ServerSecurityTab data={overview} />
							</TabsContent>
							<TabsContent value='projects'>
								<ProjectSecurityTab data={overview} />
							</TabsContent>
							<TabsContent value='logs'>
								<SecurityLogsTab servers={overview.servers} />
							</TabsContent>
							<TabsContent value='recommendations'>
								<RecommendationsTab data={overview} />
							</TabsContent>
							<TabsContent value='findings'>
								<FindingsTab
									servers={overview.servers}
									environments={overview.environments}
								/>
							</TabsContent>
							<TabsContent value='report'>
								<SecurityReportTab
									servers={overview.servers}
									environments={overview.environments}
								/>
							</TabsContent>
							<TabsContent value='schedules'>
								<Tabs defaultValue='server-schedules'>
									<TabsList className='mb-4'>
										<TabsTrigger value='server-schedules'>Servers</TabsTrigger>
										<TabsTrigger value='project-schedules'>Projects</TabsTrigger>
									</TabsList>
									<TabsContent value='server-schedules'>
										<ServerSchedulesTab data={overview} />
									</TabsContent>
									<TabsContent value='project-schedules'>
										<ProjectSchedulesTab data={overview} />
									</TabsContent>
								</Tabs>
							</TabsContent>
						</>
					)}
					<TabsContent value='forge-security'>
						<ForgeSecurityTab />
					</TabsContent>
					<TabsContent value='sessions'>
						<SessionsTab />
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}
