export interface CustomPlugin {
	id: number;
	name: string;
	slug: string;
	description: string | null;
	repo_url: string;
	repo_path: string;
	type: string;
	created_at: string;
	_count: { environment_plugins: number };
	inventory_summary?: {
		environments: number;
		installed: number;
		detected: number;
		outdated: number;
		not_scanned: number;
	};
}

export interface CustomPluginInventory {
	plugin: CustomPlugin;
	summary: {
		environments: number;
		installed: number;
		detected: number;
		outdated: number;
		not_scanned: number;
	};
	inventory: Array<{
		environment: {
			id: number;
			type: string;
			url: string;
			project: {
				id: number;
				name: string;
				client: { id: number; name: string };
			};
			server: { id: number; name: string; ip_address: string };
		};
		status: 'installed' | 'detected' | 'absent';
		installed: boolean;
		detected: boolean;
		scanned_version: string | null;
		installed_version: string | null;
		latest_version: string | null;
		outdated: boolean;
		last_scanned_at: string | null;
		version_checked_at: string | null;
	}>;
}

export interface PluginFormData {
	name: string;
	slug: string;
	description: string;
	repo_url: string;
	repo_path: string;
	type: string;
}

export const EMPTY_FORM: PluginFormData = {
	name: '',
	slug: '',
	description: '',
	repo_url: '',
	repo_path: '.',
	type: 'plugin',
};
