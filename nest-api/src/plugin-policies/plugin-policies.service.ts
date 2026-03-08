import { Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
	PluginPolicyBaseDto,
	ProjectPolicyUpdateDto,
} from './dto/plugin-policy-base.dto';

type DbPluginPolicy = {
	id: number;
	owner_id: number;
	name: string;
	is_default: boolean | null;
	allowed_plugins: string | null;
	required_plugins: string | null;
	blocked_plugins: string | null;
	pinned_versions: string | null;
	notes: string | null;
};

type DbProjectPolicy = {
	id: number;
	project_id: number;
	inherit_default: boolean | null;
	allowed_plugins: string | null;
	required_plugins: string | null;
	blocked_plugins: string | null;
	pinned_versions: string | null;
	notes: string | null;
};

type DbProjectServer = {
	id: number;
	project_id: number;
	environment: string | null;
};

type DbWpSiteState = {
	plugins: string | null;
	last_scanned_at: Date | null;
};

type PluginBundle = {
	id: string;
	name: string;
	description?: string;
	required_plugins: string[];
	pinned_versions: Record<string, string>;
};

@Injectable()
export class PluginPoliciesService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private parseList(value: string | null | undefined): string[] {
		if (!value) {
			return [];
		}
		try {
			const parsed = JSON.parse(value) as unknown;
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.filter(item => typeof item === 'string');
		} catch {
			return [];
		}
	}

	private parseRecord(
		value: string | null | undefined,
	): Record<string, string> {
		if (!value) {
			return {};
		}
		try {
			const parsed = JSON.parse(value) as unknown;
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return {};
			}
			const result: Record<string, string> = {};
			for (const [key, item] of Object.entries(parsed)) {
				if (typeof item === 'string') {
					result[key] = item;
				}
			}
			return result;
		} catch {
			return {};
		}
	}

	private serializeList(value: string[] | undefined): string {
		return JSON.stringify(Array.from(new Set(value ?? [])).sort());
	}

	private serializeRecord(value: Record<string, string> | undefined): string {
		return JSON.stringify(value ?? {});
	}

	private normalizeGlobalPolicy(row: DbPluginPolicy) {
		return {
			id: row.id,
			name: row.name,
			is_default: row.is_default ?? true,
			allowed_plugins: this.parseList(row.allowed_plugins),
			required_plugins: this.parseList(row.required_plugins),
			blocked_plugins: this.parseList(row.blocked_plugins),
			pinned_versions: this.parseRecord(row.pinned_versions),
			notes: row.notes,
		};
	}

	private normalizeProjectPolicy(row: DbProjectPolicy) {
		return {
			id: row.id,
			project_id: row.project_id,
			inherit_default: row.inherit_default ?? true,
			name: 'Project Override',
			allowed_plugins: this.parseList(row.allowed_plugins),
			required_plugins: this.parseList(row.required_plugins),
			blocked_plugins: this.parseList(row.blocked_plugins),
			pinned_versions: this.parseRecord(row.pinned_versions),
			notes: row.notes,
		};
	}

	private async ensureProjectExists(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
	}

	private async ensureGlobalPolicyRow(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbPluginPolicy[]>`
			SELECT
				id,
				owner_id,
				name,
				is_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
			FROM plugin_policies
			WHERE owner_id = ${resolvedOwnerId} AND is_default = true
			LIMIT 1
		`;

		const policy = rows[0];
		if (policy) {
			return policy;
		}

		const inserted = await this.prisma.$queryRaw<DbPluginPolicy[]>`
			INSERT INTO plugin_policies (
				owner_id,
				name,
				is_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes,
				created_at,
				updated_at
			)
			VALUES (
				${resolvedOwnerId},
				${'Default Policy'},
				${true},
				${'[]'},
				${'[]'},
				${'[]'},
				${'{}'},
				${null},
				NOW(),
				NOW()
			)
			RETURNING
				id,
				owner_id,
				name,
				is_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
		`;

		return inserted[0] as DbPluginPolicy;
	}

	private mergePolicy(
		defaultPolicy: DbPluginPolicy,
		projectPolicy?: DbProjectPolicy | null,
	) {
		const base = {
			name: defaultPolicy.name,
			allowed_plugins: this.parseList(defaultPolicy.allowed_plugins),
			required_plugins: this.parseList(defaultPolicy.required_plugins),
			blocked_plugins: this.parseList(defaultPolicy.blocked_plugins),
			pinned_versions: this.parseRecord(defaultPolicy.pinned_versions),
			notes: defaultPolicy.notes,
		};

		if (!projectPolicy) {
			return base;
		}

		if (!(projectPolicy.inherit_default ?? true)) {
			return {
				name: base.name,
				allowed_plugins: this.parseList(projectPolicy.allowed_plugins),
				required_plugins: this.parseList(projectPolicy.required_plugins),
				blocked_plugins: this.parseList(projectPolicy.blocked_plugins),
				pinned_versions: this.parseRecord(projectPolicy.pinned_versions),
				notes: projectPolicy.notes,
			};
		}

		return {
			name: base.name,
			allowed_plugins: Array.from(
				new Set([
					...base.allowed_plugins,
					...this.parseList(projectPolicy.allowed_plugins),
				]),
			).sort(),
			required_plugins: Array.from(
				new Set([
					...base.required_plugins,
					...this.parseList(projectPolicy.required_plugins),
				]),
			).sort(),
			blocked_plugins: Array.from(
				new Set([
					...base.blocked_plugins,
					...this.parseList(projectPolicy.blocked_plugins),
				]),
			).sort(),
			pinned_versions: {
				...base.pinned_versions,
				...this.parseRecord(projectPolicy.pinned_versions),
			},
			notes: projectPolicy.notes ?? base.notes,
		};
	}

	private loadBundles(): Record<string, PluginBundle> {
		const candidates = [
			process.env.VENDOR_PLUGIN_BUNDLES_PATH,
			join(process.cwd(), 'config', 'vendor-plugin-bundles.json'),
			join(process.cwd(), 'nest-api', 'config', 'vendor-plugin-bundles.json'),
		].filter((entry): entry is string => Boolean(entry));

		for (const configPath of candidates) {
			try {
				const raw = readFileSync(configPath, 'utf-8');
				const parsed = JSON.parse(raw) as {
					bundles?: Record<
						string,
						{
							name?: string;
							description?: string;
							required_plugins?: string[];
							pinned_versions?: Record<string, string>;
						}
					>;
				};

				const bundles = parsed.bundles ?? {};
				const normalized: Record<string, PluginBundle> = {};
				for (const [id, bundle] of Object.entries(bundles)) {
					normalized[id] = {
						id,
						name: bundle.name ?? id,
						description: bundle.description,
						required_plugins: Array.isArray(bundle.required_plugins)
							? bundle.required_plugins
							: [],
						pinned_versions: bundle.pinned_versions ?? {},
					};
				}
				return normalized;
			} catch {
				continue;
			}
		}

		return {};
	}

	async getGlobalPolicy(ownerId?: number) {
		const row = await this.ensureGlobalPolicyRow(ownerId);
		return this.normalizeGlobalPolicy(row);
	}

	async updateGlobalPolicy(payload: PluginPolicyBaseDto, ownerId?: number) {
		const current = await this.ensureGlobalPolicyRow(ownerId);
		const name = payload.name ?? current.name;
		const allowedPlugins = this.serializeList(
			payload.allowed_plugins ?? this.parseList(current.allowed_plugins),
		);
		const requiredPlugins = this.serializeList(
			payload.required_plugins ?? this.parseList(current.required_plugins),
		);
		const blockedPlugins = this.serializeList(
			payload.blocked_plugins ?? this.parseList(current.blocked_plugins),
		);
		const pinnedVersions = this.serializeRecord(
			payload.pinned_versions ?? this.parseRecord(current.pinned_versions),
		);

		const rows = await this.prisma.$queryRaw<DbPluginPolicy[]>`
			UPDATE plugin_policies
			SET
				name = ${name},
				allowed_plugins = ${allowedPlugins},
				required_plugins = ${requiredPlugins},
				blocked_plugins = ${blockedPlugins},
				pinned_versions = ${pinnedVersions},
				notes = ${payload.notes ?? current.notes},
				updated_at = NOW()
			WHERE id = ${current.id}
			RETURNING
				id,
				owner_id,
				name,
				is_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
		`;

		return this.normalizeGlobalPolicy(rows[0] as DbPluginPolicy);
	}

	async getProjectPolicy(projectId: number, ownerId?: number) {
		await this.ensureProjectExists(projectId, ownerId);
		const rows = await this.prisma.$queryRaw<DbProjectPolicy[]>`
			SELECT
				id,
				project_id,
				inherit_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
			FROM project_plugin_policies
			WHERE project_id = ${projectId}
			LIMIT 1
		`;

		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Project policy not found' });
		}

		return this.normalizeProjectPolicy(row);
	}

	async upsertProjectPolicy(
		projectId: number,
		payload: ProjectPolicyUpdateDto,
		ownerId?: number,
	) {
		await this.ensureProjectExists(projectId, ownerId);
		const existing = await this.prisma.$queryRaw<DbProjectPolicy[]>`
			SELECT
				id,
				project_id,
				inherit_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
			FROM project_plugin_policies
			WHERE project_id = ${projectId}
			LIMIT 1
		`;

		const current = existing[0];
		if (!current) {
			const inserted = await this.prisma.$queryRaw<DbProjectPolicy[]>`
				INSERT INTO project_plugin_policies (
					project_id,
					inherit_default,
					allowed_plugins,
					required_plugins,
					blocked_plugins,
					pinned_versions,
					notes,
					created_at,
					updated_at
				)
				VALUES (
					${projectId},
					${payload.inherit_default ?? true},
					${this.serializeList(payload.allowed_plugins)},
					${this.serializeList(payload.required_plugins)},
					${this.serializeList(payload.blocked_plugins)},
					${this.serializeRecord(payload.pinned_versions)},
					${payload.notes ?? null},
					NOW(),
					NOW()
				)
				RETURNING
					id,
					project_id,
					inherit_default,
					allowed_plugins,
					required_plugins,
					blocked_plugins,
					pinned_versions,
					notes
			`;

			return this.normalizeProjectPolicy(inserted[0] as DbProjectPolicy);
		}

		const rows = await this.prisma.$queryRaw<DbProjectPolicy[]>`
			UPDATE project_plugin_policies
			SET
				inherit_default = ${payload.inherit_default ?? current.inherit_default ?? true},
				allowed_plugins = ${this.serializeList(
					payload.allowed_plugins ?? this.parseList(current.allowed_plugins),
				)},
				required_plugins = ${this.serializeList(
					payload.required_plugins ?? this.parseList(current.required_plugins),
				)},
				blocked_plugins = ${this.serializeList(
					payload.blocked_plugins ?? this.parseList(current.blocked_plugins),
				)},
				pinned_versions = ${this.serializeRecord(
					payload.pinned_versions ?? this.parseRecord(current.pinned_versions),
				)},
				notes = ${payload.notes ?? current.notes},
				updated_at = NOW()
			WHERE project_id = ${projectId}
			RETURNING
				id,
				project_id,
				inherit_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
		`;

		return this.normalizeProjectPolicy(rows[0] as DbProjectPolicy);
	}

	async getEffectivePolicy(projectId: number, ownerId?: number) {
		await this.ensureProjectExists(projectId, ownerId);
		const global = await this.ensureGlobalPolicyRow(ownerId);
		const projectRows = await this.prisma.$queryRaw<DbProjectPolicy[]>`
			SELECT
				id,
				project_id,
				inherit_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
			FROM project_plugin_policies
			WHERE project_id = ${projectId}
			LIMIT 1
		`;
		const projectPolicy = projectRows[0];
		const merged = this.mergePolicy(global, projectPolicy);

		return {
			project_id: projectId,
			source: projectPolicy ? 'project_override' : 'default',
			name: merged.name,
			allowed_plugins: merged.allowed_plugins,
			required_plugins: merged.required_plugins,
			blocked_plugins: merged.blocked_plugins,
			pinned_versions: merged.pinned_versions,
			notes: merged.notes,
		};
	}

	async listBundles() {
		const bundles = this.loadBundles();
		return Object.values(bundles).map(bundle => ({
			id: bundle.id,
			name: bundle.name,
			description: bundle.description ?? null,
			required_plugins: bundle.required_plugins,
			pinned_versions: bundle.pinned_versions,
		}));
	}

	private getBundleOrThrow(bundleId: string) {
		const bundles = this.loadBundles();
		const bundle = bundles[bundleId];
		if (!bundle) {
			throw new NotFoundException({ detail: 'Bundle not found' });
		}
		return bundle;
	}

	async applyBundleToGlobalPolicy(bundleId: string, ownerId?: number) {
		const bundle = this.getBundleOrThrow(bundleId);
		const policy = await this.ensureGlobalPolicyRow(ownerId);

		const required = Array.from(
			new Set([
				...this.parseList(policy.required_plugins),
				...bundle.required_plugins,
			]),
		).sort();

		const pinned = {
			...this.parseRecord(policy.pinned_versions),
			...bundle.pinned_versions,
		};

		const rows = await this.prisma.$queryRaw<DbPluginPolicy[]>`
			UPDATE plugin_policies
			SET
				required_plugins = ${JSON.stringify(required)},
				pinned_versions = ${JSON.stringify(pinned)},
				updated_at = NOW()
			WHERE id = ${policy.id}
			RETURNING
				id,
				owner_id,
				name,
				is_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
		`;

		return this.normalizeGlobalPolicy(rows[0] as DbPluginPolicy);
	}

	async applyBundleToProjectPolicy(
		projectId: number,
		bundleId: string,
		ownerId?: number,
	) {
		const bundle = this.getBundleOrThrow(bundleId);
		const policy = await this.upsertProjectPolicy(projectId, {}, ownerId);

		const required = Array.from(
			new Set([...policy.required_plugins, ...bundle.required_plugins]),
		).sort();
		const pinned = {
			...policy.pinned_versions,
			...bundle.pinned_versions,
		};

		const rows = await this.prisma.$queryRaw<DbProjectPolicy[]>`
			UPDATE project_plugin_policies
			SET
				required_plugins = ${JSON.stringify(required)},
				pinned_versions = ${JSON.stringify(pinned)},
				updated_at = NOW()
			WHERE project_id = ${projectId}
			RETURNING
				id,
				project_id,
				inherit_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
		`;

		return this.normalizeProjectPolicy(rows[0] as DbProjectPolicy);
	}

	async getPluginDrift(projectServerId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbProjectServer[]>`
			SELECT
				ps.id,
				ps.project_id,
				ps.environment::text AS environment
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${projectServerId} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const projectServer = rows[0];
		if (!projectServer) {
			throw new NotFoundException({ detail: 'Project-server not found' });
		}

		const global = await this.ensureGlobalPolicyRow(resolvedOwnerId);
		const projectRows = await this.prisma.$queryRaw<DbProjectPolicy[]>`
			SELECT
				id,
				project_id,
				inherit_default,
				allowed_plugins,
				required_plugins,
				blocked_plugins,
				pinned_versions,
				notes
			FROM project_plugin_policies
			WHERE project_id = ${projectServer.project_id}
			LIMIT 1
		`;
		const effective = this.mergePolicy(global, projectRows[0]);

		const stateRows = await this.prisma.$queryRaw<DbWpSiteState[]>`
			SELECT plugins, last_scanned_at
			FROM wp_site_states
			WHERE project_server_id = ${projectServerId}
			LIMIT 1
		`;

		const state = stateRows[0];
		let installedPlugins: Array<{ name?: string; version?: string }> = [];
		if (state?.plugins) {
			try {
				const parsed = JSON.parse(state.plugins) as unknown;
				if (Array.isArray(parsed)) {
					installedPlugins = parsed.filter(
						item => item && typeof item === 'object',
					) as Array<{ name?: string; version?: string }>;
				}
			} catch {
				installedPlugins = [];
			}
		}

		const installedSlugs = installedPlugins
			.map(plugin => plugin.name)
			.filter((name): name is string => Boolean(name));
		const installedVersions: Record<string, string | undefined> = {};
		for (const plugin of installedPlugins) {
			if (plugin.name) {
				installedVersions[plugin.name] = plugin.version;
			}
		}

		const missingRequired = effective.required_plugins.filter(
			slug => !installedSlugs.includes(slug),
		);
		const blockedInstalled = installedSlugs.filter(slug =>
			effective.blocked_plugins.includes(slug),
		);
		const disallowedInstalled =
			effective.allowed_plugins.length > 0
				? installedSlugs.filter(
						slug =>
							!effective.allowed_plugins.includes(slug) &&
							!effective.required_plugins.includes(slug),
					)
				: [];

		const versionMismatches: Record<string, string> = {};
		for (const [slug, pinnedVersion] of Object.entries(
			effective.pinned_versions,
		)) {
			const currentVersion = installedVersions[slug];
			if (currentVersion && currentVersion !== pinnedVersion) {
				versionMismatches[slug] = currentVersion;
			}
		}

		return {
			project_server_id: projectServerId,
			project_id: projectServer.project_id,
			environment: projectServer.environment,
			scanned_at: state?.last_scanned_at?.toISOString() ?? null,
			missing_required: missingRequired,
			blocked_installed: blockedInstalled,
			disallowed_installed: disallowedInstalled,
			version_mismatches: versionMismatches,
		};
	}
}
