export interface Role {
	id: number;
	name: string;
	display_name: string;
	color: string;
}

export interface User {
	id: number;
	email: string;
	username: string;
	full_name: string | null;
	is_active: boolean;
	is_superuser: boolean;
	avatar_url: string | null;
	roles: Role[];
}

export interface UserFormData {
	email: string;
	username: string;
	password: string;
	full_name: string;
	role_ids: number[];
}
