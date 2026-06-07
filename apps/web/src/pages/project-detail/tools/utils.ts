import { CleanupScheduleData } from './types';

export const DEFAULT_SCHEDULE: CleanupScheduleData = {
	enabled: true,
	frequency: 'weekly',
	hour: 3,
	minute: 30,
	day_of_week: 1,
	day_of_month: 1,
	keep_revisions: 3,
};

export const WP_FIX_ACTIONS = [
	{
		value: 'flush_rewrite',
		label: 'Flush Rewrite Rules',
		description: 'Regenerate WordPress permalink rules',
	},
	{
		value: 'clear_cache',
		label: 'Clear Cache',
		description: 'Delete all transients and object cache',
	},
	{
		value: 'fix_permissions',
		label: 'Fix Permissions',
		description: 'Set 755 dirs, 644 files, chown to site owner',
	},
	{
		value: 'disable_plugins',
		label: 'Disable All Plugins',
		description: 'Rename plugins folder to disable all plugins',
	},
	{
		value: 'enable_plugins',
		label: 'Re-enable Plugins',
		description: 'Rename plugins-disabled folder back to plugins',
	},
] as const;

export const REVERT_OPTIONS = [
	{ value: '0', label: 'Never' },
	{ value: '15', label: '15 minutes' },
	{ value: '30', label: '30 minutes' },
	{ value: '60', label: '1 hour' },
	{ value: '120', label: '2 hours' },
];
