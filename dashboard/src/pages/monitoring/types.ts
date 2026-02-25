export interface Monitor {
	id: number;
	name: string;
	url: string;
	monitor_type: string;
	is_active: boolean;
	last_check_at: string | null;
	last_status: string | null;
	last_response_time_ms: number | null;
	uptime_percentage: number | null;
	interval_seconds: number;
}

export interface CreateMonitorForm {
	name: string;
	url: string;
	monitor_type: string;
	interval_seconds: number;
	timeout_seconds: number;
}
