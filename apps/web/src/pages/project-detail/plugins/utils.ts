import { Plugin, PluginScan, PluginScanOutput } from './types';

export function parseScanPlugins(scan: PluginScan | undefined): {
	isBedrock: boolean;
	plugins: Plugin[];
	muPlugins: Plugin[];
} {
	if (!scan) return { isBedrock: false, plugins: [], muPlugins: [] };
	if (Array.isArray(scan.plugins)) {
		return {
			isBedrock: false,
			plugins: scan.plugins as Plugin[],
			muPlugins: [],
		};
	}
	const output = scan.plugins as PluginScanOutput;
	const all = Array.isArray(output.plugins) ? output.plugins : [];
	return {
		isBedrock: output.is_bedrock ?? false,
		plugins: all.filter(p => !p.is_mu_plugin),
		muPlugins: all.filter(p => !!p.is_mu_plugin),
	};
}

export function customPluginRepoHref(repoUrl: string) {
	const sshMatch = repoUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
	if (sshMatch) {
		return `https://${sshMatch[1]}/${sshMatch[2]}`;
	}
	return repoUrl.replace(/\.git$/, '');
}
