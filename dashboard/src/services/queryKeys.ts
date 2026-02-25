export const queryKeys = {
	users: {
		all: ['users'] as const,
		list: (search: string) => ['users', 'list', search] as const,
	},
	roles: {
		all: ['roles'] as const,
	},
	monitors: {
		all: ['monitors'] as const,
		list: () => ['monitors', 'list'] as const,
	},
	projects: {
		local: () => ['projects', 'local'] as const,
		remote: () => ['projects', 'remote'] as const,
	},
	tags: {
		all: ['tags'] as const,
		project: (projectId?: number) => ['tags', 'project', projectId] as const,
	},
};
