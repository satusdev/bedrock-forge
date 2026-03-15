export interface LocalProject {
	project_name: string;
	directory: string;
	wp_home: string;
	repo_url: string | null;
	created_date: string | null;
	ddev_status: string;
}

export interface RemoteProject {
	id: number;
	name: string;
	slug: string;
	domain: string;
	environment: string;
	status: string;
	server_name: string | null;
	health_score: number;
	tags: string[];
	created_at: string;
}

export interface TagOption {
	id: number;
	name: string;
	color: string;
}
