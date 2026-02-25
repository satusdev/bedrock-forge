export type AuthenticatedUser = {
	id: number;
	email: string;
	username: string;
	full_name: string | null;
	is_active: boolean;
	is_superuser: boolean;
};
