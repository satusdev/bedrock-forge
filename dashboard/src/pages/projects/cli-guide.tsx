import { useState } from 'react';
import {
	BookOpen,
	Check,
	ChevronDown,
	ChevronRight,
	Copy,
	Database,
	Play,
	Terminal,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Card from '@/components/ui/Card';

const CLICommand = ({
	command,
	description,
}: {
	command: string;
	description: string;
}) => {
	const [copied, setCopied] = useState(false);

	const copyToClipboard = () => {
		navigator.clipboard.writeText(command);
		setCopied(true);
		toast.success('Command copied!');
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className='flex items-center justify-between p-3 bg-gray-900 rounded-lg group'>
			<div className='flex-1'>
				<code className='text-green-400 text-sm font-mono'>{command}</code>
				<p className='text-gray-400 text-xs mt-1'>{description}</p>
			</div>
			<button
				onClick={copyToClipboard}
				className='ml-3 p-2 text-gray-400 hover:text-white transition-colors'
				title='Copy command'
			>
				{copied ? (
					<Check className='w-4 h-4 text-green-400' />
				) : (
					<Copy className='w-4 h-4' />
				)}
			</button>
		</div>
	);
};

export function CLIGuideSection({ hasProjects }: { hasProjects: boolean }) {
	const [isExpanded, setIsExpanded] = useState(!hasProjects);

	return (
		<Card className='bg-gradient-to-r from-gray-800 to-gray-900 text-white mb-6'>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className='w-full flex items-center justify-between'
			>
				<div className='flex items-center'>
					<Terminal className='w-5 h-5 mr-3 text-green-400' />
					<div className='text-left'>
						<h3 className='font-semibold'>Local Development Commands</h3>
						<p className='text-sm text-gray-400'>
							Manage local projects via CLI
						</p>
					</div>
				</div>
				{isExpanded ? (
					<ChevronDown className='w-5 h-5 text-gray-400' />
				) : (
					<ChevronRight className='w-5 h-5 text-gray-400' />
				)}
			</button>

			{isExpanded && (
				<div className='mt-6 space-y-6'>
					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<BookOpen className='w-4 h-4 mr-2' />
							Getting Started
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='forge new my-site'
								description='Create a new WordPress project with DDEV'
							/>
							<CLICommand
								command='forge list'
								description='List all local projects'
							/>
						</div>
					</div>

					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<Play className='w-4 h-4 mr-2' />
							DDEV Control
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='ddev start'
								description='Start DDEV environment (run in project folder)'
							/>
							<CLICommand
								command='ddev stop'
								description='Stop DDEV environment'
							/>
							<CLICommand
								command='ddev restart'
								description='Restart DDEV environment'
							/>
						</div>
					</div>

					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<Terminal className='w-4 h-4 mr-2' />
							WordPress CLI
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='ddev wp plugin list'
								description='List installed plugins'
							/>
							<CLICommand
								command='ddev wp theme list'
								description='List installed themes'
							/>
							<CLICommand
								command='ddev ssh'
								description='SSH into the container'
							/>
						</div>
					</div>

					<div>
						<h4 className='text-sm font-medium text-gray-300 mb-3 flex items-center'>
							<Database className='w-4 h-4 mr-2' />
							Database Operations
						</h4>
						<div className='space-y-2'>
							<CLICommand
								command='ddev export-db > backup.sql.gz'
								description='Export database to file'
							/>
							<CLICommand
								command='ddev import-db --file=backup.sql.gz'
								description='Import database from file'
							/>
						</div>
					</div>

					<div className='p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg'>
						<p className='text-sm text-blue-200'>
							<strong>Note:</strong> Local projects are managed on your
							development machine. This dashboard displays projects found in{' '}
							<code className='bg-blue-900/50 px-1 rounded'>
								~/.forge/projects.json
							</code>
						</p>
					</div>
				</div>
			)}
		</Card>
	);
}
