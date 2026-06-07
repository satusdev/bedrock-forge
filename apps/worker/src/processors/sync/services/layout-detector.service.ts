import { Injectable, Logger } from '@nestjs/common';
import { StepTracker } from '../../../services/step-tracker';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { shellQuote } from '../../../utils/processor-utils';

type Executor = Awaited<ReturnType<typeof createRemoteExecutor>>;

export type WpLayout = {
	/** Absolute path to the directory containing wp-includes/ (= wp core). Used for --path with WP-CLI. */
	corePath: string;
	/** Absolute path to the wp-content (or web/app) directory. Used for file sync / URL replace. */
	contentPath: string;
	/** True when a Bedrock-style layout was detected (web/wp + web/app). */
	isBedrock: boolean;
};

@Injectable()
export class LayoutDetectorService {
	private readonly logger = new Logger(LayoutDetectorService.name);

	/**
	 * Detect the WordPress installation layout on a remote server.
	 *
	 * Probes for wp-includes/version.php at common locations:
	 *   - {rootPath}/wp-includes/version.php          → standard WP
	 *   - {rootPath}/web/wp/wp-includes/version.php   → Bedrock (web/wp + web/app)
	 *   - {rootPath}/wp/wp-includes/version.php       → Bedrock variant (wp + app)
	 *
	 * Falls back to standard layout when none of the above are found.
	 */
	async detectWpLayout(
		executor: Executor,
		rootPath: string,
		tracker: StepTracker,
		label: string,
	): Promise<WpLayout> {
		const candidates: Array<{ core: string; content: string; label: string }> =
			[
				{
					core: rootPath,
					content: `${rootPath}/wp-content`,
					label: 'standard',
				},
				{
					core: `${rootPath}/web/wp`,
					content: `${rootPath}/web/app`,
					label: 'bedrock (web/wp)',
				},
				{
					core: `${rootPath}/wp`,
					content: `${rootPath}/app`,
					label: 'bedrock (wp)',
				},
			];

		for (const candidate of candidates) {
			try {
				const check = await executor.execute(
					`test -f ${shellQuote(`${candidate.core}/wp-includes/version.php`)} && echo ok || echo missing`,
				);
				if (check.stdout.trim() === 'ok') {
					const isBedrock = candidate.label.startsWith('bedrock');
					await tracker.track({
						step: `${label} WordPress layout detected`,
						level: 'info',
						detail: `${candidate.label} — core=${candidate.core}, content=${candidate.content}`,
					});
					return {
						corePath: candidate.core,
						contentPath: candidate.content,
						isBedrock,
					};
				}
			} catch {
				// probe failed — try next candidate
			}
		}

		// Fallback — assume standard layout and continue
		await tracker.track({
			step: `${label} WordPress layout: falling back to standard`,
			level: 'warn',
			detail: `wp-includes/version.php not found under any known path — assuming ${rootPath}/wp-content`,
		});
		return {
			corePath: rootPath,
			contentPath: `${rootPath}/wp-content`,
			isBedrock: false,
		};
	}
}
