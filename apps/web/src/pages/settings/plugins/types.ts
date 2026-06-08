export interface PluginInventoryItem {
	environment: { id: number; type: string; url: string };
	project: { id: number; name: string };
	client: { id: number; name: string };
	server: { id: number; name: string; ip_address: string | null };
	scan_id: number;
	scanned_at: string;
	slug: string;
	name: string;
	version: string | null;
	status: 'active' | 'inactive' | string | null;
	author: string | null;
	latest_version: string | null;
	update_available: boolean;
	source: 'composer' | 'github' | 'manual' | string;
	composer_constraint: string | null;
}

export interface PluginInventoryResponse {
	items: PluginInventoryItem[];
	total: number;
	environments_scanned: number;
}
