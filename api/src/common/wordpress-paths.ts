import { dirname } from 'path';

export type WordPressRuntimeCandidate = {
	wpRoot: string;
	wpPath: string;
};

export function normalizeWordPressPath(input: string) {
	const normalized = input
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.trim();
	if (!normalized) {
		return '/';
	}
	return normalized.endsWith('/') && normalized !== '/'
		? normalized.slice(0, -1)
		: normalized;
}

export function expandWordPressPathCandidates(
	pathCandidates: Array<string | null | undefined>,
): string[] {
	const values = pathCandidates
		.map(value => value?.trim() || '')
		.filter(Boolean)
		.flatMap(value => {
			const normalized = normalizeWordPressPath(value);
			const parent = dirname(normalized);
			const candidates = [normalized];

			if (/\/web\/wp$/i.test(normalized)) {
				// Already at Bedrock core dir (public_html/web/wp) — add webroot and project root
				const webDir = dirname(normalized);
				const projectRoot = dirname(webDir);
				candidates.push(webDir);
				if (projectRoot && projectRoot !== normalized) {
					candidates.push(projectRoot);
				}
			} else if (/\/web$/i.test(normalized)) {
				// Bedrock webroot (public_html/web) — add project root and wp core subdir
				if (parent && parent !== normalized) {
					candidates.push(parent);
				}
				candidates.push(normalizeWordPressPath(`${normalized}/wp`));
			} else {
				// Project root or standard WP path — add /web and /web/wp (Bedrock layouts)
				candidates.push(normalizeWordPressPath(`${normalized}/web`));
				candidates.push(normalizeWordPressPath(`${normalized}/web/wp`));
			}

			if (parent && parent !== normalized) {
				candidates.push(parent);
				candidates.push(normalizeWordPressPath(`${parent}/current`));
				candidates.push(normalizeWordPressPath(`${parent}/current/web`));
				candidates.push(normalizeWordPressPath(`${parent}/current/web/wp`));
			}

			candidates.push(normalizeWordPressPath(`${normalized}/current`));
			candidates.push(normalizeWordPressPath(`${normalized}/current/web`));
			candidates.push(normalizeWordPressPath(`${normalized}/current/web/wp`));

			return candidates;
		})
		.filter(value => value.startsWith('/'))
		.filter((value, index, array) => array.indexOf(value) === index);

	return values;
}

export function buildWordPressSearchBases(pathCandidates: string[]): string[] {
	const values = pathCandidates
		.flatMap(value => {
			const normalized = normalizeWordPressPath(value);
			const parent = dirname(normalized);
			return [normalized, parent];
		})
		.filter(value => value.startsWith('/'))
		.filter(value => value !== '/' && value !== '/home' && value !== '/var')
		.filter((value, index, array) => array.indexOf(value) === index);

	return values;
}

export function deriveWordPressRuntimeCandidatesFromPathCandidates(
	pathCandidates: string[],
): WordPressRuntimeCandidate[] {
	return pathCandidates
		.flatMap(value => {
			const normalized = normalizeWordPressPath(value);
			if (/\/web\/wp$/i.test(normalized)) {
				// Bedrock core dir (public_html/web/wp) — project root is 2 levels up
				const webDir = dirname(normalized);
				const projectRoot = dirname(webDir);
				return [
					{
						wpRoot:
							projectRoot && projectRoot !== normalized ? projectRoot : webDir,
						wpPath: normalized,
					},
				];
			}
			if (/\/web$/i.test(normalized)) {
				const parent = dirname(normalized);
				const wpRoot = parent && parent !== normalized ? parent : normalized;
				return [
					// WP core nested in /web/wp (Roots Bedrock default) — checked first
					// because WP-CLI must run from wpRoot with --path pointing at WP core.
					// The bare /web path (webroot) does not contain wp-load.php etc.
					{
						wpRoot,
						wpPath: normalizeWordPressPath(`${normalized}/wp`),
					},
					// WP core directly in /web (less common, non-standard Bedrock variant)
					{ wpRoot, wpPath: normalized },
				];
			}
			return [
				{ wpRoot: normalized, wpPath: normalized },
				{
					wpRoot: normalized,
					wpPath: normalizeWordPressPath(`${normalized}/web`),
				},
				// Bedrock: WP core in /web/wp
				{
					wpRoot: normalized,
					wpPath: normalizeWordPressPath(`${normalized}/web/wp`),
				},
			];
		})
		.filter(
			(candidate, index, array) =>
				array.findIndex(
					entry =>
						entry.wpRoot === candidate.wpRoot &&
						entry.wpPath === candidate.wpPath,
				) === index,
		);
}

export function deriveWordPressRuntimeCandidatesFromConfigPaths(
	configPaths: string[],
): WordPressRuntimeCandidate[] {
	return configPaths
		.map(value => normalizeWordPressPath(value))
		.filter(value => value.endsWith('/wp-config.php'))
		.flatMap(configPath => {
			const wpDir = normalizeWordPressPath(
				configPath.replace(/\/wp-config\.php$/i, ''),
			);
			const isBedrock =
				/\/web$/i.test(wpDir) ||
				/\/web\/app$/i.test(wpDir) ||
				configPath.includes('/web/wp-config.php');
			if (isBedrock) {
				const wpRoot = /\/web$/i.test(wpDir)
					? normalizeWordPressPath(wpDir.slice(0, -4))
					: normalizeWordPressPath(wpDir.split('/web/app')[0] || wpDir);
				return [
					// WP core directly in /web
					{ wpRoot, wpPath: normalizeWordPressPath(`${wpRoot}/web`) },
					// WP core in /web/wp (Roots Bedrock default)
					{
						wpRoot,
						wpPath: normalizeWordPressPath(`${wpRoot}/web/wp`),
					},
				];
			}
			// Not detected as Bedrock from config path alone — return standard candidate
			// plus Bedrock variants in case wp-config.php is at the project root
			// (Bedrock places wp-config.php at project root, not in web/)
			return [
				{ wpRoot: wpDir, wpPath: wpDir },
				// Bedrock: WP served from /web
				{
					wpRoot: wpDir,
					wpPath: normalizeWordPressPath(`${wpDir}/web`),
				},
				// Bedrock: WP core in /web/wp
				{
					wpRoot: wpDir,
					wpPath: normalizeWordPressPath(`${wpDir}/web/wp`),
				},
			];
		})
		.filter(
			(candidate, index, array) =>
				array.findIndex(
					entry =>
						entry.wpRoot === candidate.wpRoot &&
						entry.wpPath === candidate.wpPath,
				) === index,
		);
}
