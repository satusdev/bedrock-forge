import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigDriftRepository } from './config-drift.repository';

export interface Plugin {
	slug: string;
	version?: string;
	name?: string;
}

export interface PhpSettings {
	[key: string]: string;
}

export interface PluginDiff {
	slug: string;
	name?: string;
	baselineVersion: string | null;
	envVersion: string | null;
	status: 'match' | 'mismatch' | 'missing' | 'extra';
}

export interface PhpDiff {
	key: string;
	baselineValue: string;
	envValue: string;
}

@Injectable()
export class ConfigDriftService {
	constructor(private readonly repo: ConfigDriftRepository) {}

	async getDrift(projectId: number) {
		const envs = await this.repo.getProjectEnvironmentsWithScans(
			BigInt(projectId),
		);
		if (!envs.length) {
			return {
				baselineEnvId: null,
				message: 'No environments found',
				diffs: [],
			};
		}

		const baseline = envs.find(e => e.is_baseline);
		if (!baseline) {
			return {
				baselineEnvId: null,
				message: 'No baseline environment set',
				diffs: [],
			};
		}

		const baselineScan = baseline.plugin_scans[0] ?? null;
		const baselinePlugins = this.extractPlugins(baselineScan);
		const baselinePhp = this.extractPhpSettings(baselineScan);

		const diffs = envs
			.filter(e => !e.is_baseline)
			.map(env => {
				const scan = env.plugin_scans[0] ?? null;
				const envPlugins = this.extractPlugins(scan);
				const envPhp = this.extractPhpSettings(scan);

				return {
					environmentId: Number(env.id),
					type: env.type,
					url: env.url,
					scannedAt: scan ? scan.scanned_at : null,
					pluginDiffs: this.comparePlugins(baselinePlugins, envPlugins),
					phpDiffs:
						baselinePhp && envPhp ? this.comparePhp(baselinePhp, envPhp) : [],
					warnWpDebugEnabled: this.detectWpDebug(scan),
				};
			});

		return {
			baselineEnvId: Number(baseline.id),
			baselineType: baseline.type,
			baselineUrl: baseline.url,
			baselineScannedAt: baselineScan ? baselineScan.scanned_at : null,
			diffs,
		};
	}

	async setBaseline(projectId: number, envId: number) {
		const envs = await this.repo.getProjectEnvironmentsWithScans(
			BigInt(projectId),
		);
		const env = envs.find(e => Number(e.id) === envId);
		if (!env)
			throw new NotFoundException(
				`Environment ${envId} not found in project ${projectId}`,
			);
		await this.repo.setBaseline(BigInt(projectId), BigInt(envId));
		return { baselineEnvId: envId };
	}

	async clearBaseline(projectId: number) {
		await this.repo.clearBaseline(BigInt(projectId));
		return { baselineEnvId: null };
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	private extractPlugins(
		scan: { plugins: unknown } | null,
	): Map<string, Plugin> {
		const map = new Map<string, Plugin>();
		if (!scan) return map;
		const data = scan.plugins as { plugins?: Plugin[] } | Plugin[] | null;
		const list: Plugin[] = Array.isArray(data) ? data : (data?.plugins ?? []);
		for (const p of list) {
			if (p?.slug) map.set(p.slug, p);
		}
		return map;
	}

	private extractPhpSettings(
		scan: { plugins: unknown } | null,
	): PhpSettings | null {
		if (!scan) return null;
		const data = scan.plugins as { php_settings?: PhpSettings } | null;
		return data?.php_settings ?? null;
	}

	private comparePlugins(
		baseline: Map<string, Plugin>,
		target: Map<string, Plugin>,
	): PluginDiff[] {
		const diffs: PluginDiff[] = [];
		const allSlugs = new Set([...baseline.keys(), ...target.keys()]);

		for (const slug of allSlugs) {
			const base = baseline.get(slug);
			const env = target.get(slug);

			if (!base) {
				diffs.push({
					slug,
					name: env?.name,
					baselineVersion: null,
					envVersion: env?.version ?? null,
					status: 'extra',
				});
			} else if (!env) {
				diffs.push({
					slug,
					name: base.name,
					baselineVersion: base.version ?? null,
					envVersion: null,
					status: 'missing',
				});
			} else if (base.version !== env.version) {
				diffs.push({
					slug,
					name: base.name,
					baselineVersion: base.version ?? null,
					envVersion: env.version ?? null,
					status: 'mismatch',
				});
			} else {
				diffs.push({
					slug,
					name: base.name,
					baselineVersion: base.version ?? null,
					envVersion: env.version ?? null,
					status: 'match',
				});
			}
		}

		// Sort: mismatch/missing/extra first, then match
		return diffs.sort((a, b) => {
			const order = { mismatch: 0, missing: 1, extra: 2, match: 3 };
			return (order[a.status] ?? 3) - (order[b.status] ?? 3);
		});
	}

	private comparePhp(baseline: PhpSettings, target: PhpSettings): PhpDiff[] {
		const diffs: PhpDiff[] = [];
		const allKeys = new Set([...Object.keys(baseline), ...Object.keys(target)]);
		for (const key of allKeys) {
			const bv = baseline[key] ?? '';
			const ev = target[key] ?? '';
			if (bv !== ev) {
				diffs.push({ key, baselineValue: bv, envValue: ev });
			}
		}
		return diffs;
	}

	private detectWpDebug(scan: { plugins: unknown } | null): boolean {
		if (!scan) return false;
		const data = scan.plugins as
			| { wp_debug?: boolean }
			| { plugins?: { is_active?: boolean }[] }
			| null;
		const asObj = data as Record<string, unknown> | null;
		return asObj?.wp_debug === true;
	}
}
