import { LayoutDetectorService } from './layout-detector.service';
import { StepTracker } from '../../../services/step-tracker';

describe('LayoutDetectorService', () => {
	let service: LayoutDetectorService;

	beforeEach(() => {
		service = new LayoutDetectorService();
	});

	function makeExecutor(commands: Record<string, { code: number; stdout: string; stderr: string }>) {
		return {
			execute: jest.fn().mockImplementation((cmd: string) => {
				const match = Object.keys(commands).find(k => cmd.includes(k));
				if (match) {
					return Promise.resolve(commands[match]);
				}
				return Promise.resolve({ code: 0, stdout: 'missing', stderr: '' });
			}),
		} as any;
	}

	function makeTracker() {
		return {
			track: jest.fn().mockResolvedValue(undefined),
		} as unknown as StepTracker;
	}

	it('detects Bedrock layout', async () => {
		const executor = makeExecutor({
			'web/wp/wp-includes/version.php': { code: 0, stdout: 'ok', stderr: '' },
		});
		const tracker = makeTracker();

		const layout = await service.detectWpLayout(executor, '/var/www', tracker, 'target');

		expect(layout.isBedrock).toBe(true);
		expect(layout.corePath).toBe('/var/www/web/wp');
		expect(layout.contentPath).toBe('/var/www/web/app');
	});

	it('detects standard WordPress layout', async () => {
		const executor = makeExecutor({
			'/var/www/wp-includes/version.php': { code: 0, stdout: 'ok', stderr: '' },
		});
		const tracker = makeTracker();

		const layout = await service.detectWpLayout(executor, '/var/www', tracker, 'target');

		expect(layout.isBedrock).toBe(false);
		expect(layout.corePath).toBe('/var/www');
		expect(layout.contentPath).toBe('/var/www/wp-content');
	});
});
