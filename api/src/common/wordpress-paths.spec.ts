import {
	buildWordPressSearchBases,
	deriveWordPressRuntimeCandidatesFromConfigPaths,
	deriveWordPressRuntimeCandidatesFromPathCandidates,
	expandWordPressPathCandidates,
	normalizeWordPressPath,
} from './wordpress-paths';

describe('normalizeWordPressPath', () => {
	it('should remove trailing slash', () => {
		expect(normalizeWordPressPath('/home/user/public_html/')).toBe(
			'/home/user/public_html',
		);
	});

	it('should collapse double slashes', () => {
		expect(normalizeWordPressPath('/home//user/public_html')).toBe(
			'/home/user/public_html',
		);
	});

	it('should preserve root slash', () => {
		expect(normalizeWordPressPath('/')).toBe('/');
	});

	it('should handle empty string', () => {
		expect(normalizeWordPressPath('')).toBe('/');
	});

	it('should replace backslashes', () => {
		expect(normalizeWordPressPath('\\home\\user\\path')).toBe(
			'/home/user/path',
		);
	});
});

describe('expandWordPressPathCandidates', () => {
	it('skips null and empty values', () => {
		const result = expandWordPressPathCandidates([null, undefined, '']);
		expect(result).toHaveLength(0);
	});

	it('deduplicates identical candidates', () => {
		const result = expandWordPressPathCandidates([
			'/home/mg/public_html',
			'/home/mg/public_html',
		]);
		const unique = new Set(result);
		expect(unique.size).toBe(result.length);
	});

	describe('Bedrock project root (non-/web path)', () => {
		const projectRoot = '/home/mg.staging.ly/public_html';
		let result: string[];
		beforeEach(() => {
			result = expandWordPressPathCandidates([projectRoot]);
		});

		it('includes the project root itself', () => {
			expect(result).toContain(projectRoot);
		});

		it('includes /web candidate', () => {
			expect(result).toContain(`${projectRoot}/web`);
		});

		it('includes /web/wp candidate (Bedrock core dir)', () => {
			expect(result).toContain(`${projectRoot}/web/wp`);
		});

		it('includes parent directory', () => {
			expect(result).toContain('/home/mg.staging.ly');
		});
	});

	describe('Bedrock webroot input (/web path)', () => {
		const webRoot = '/home/mg.staging.ly/public_html/web';
		let result: string[];
		beforeEach(() => {
			result = expandWordPressPathCandidates([webRoot]);
		});

		it('includes the webroot itself', () => {
			expect(result).toContain(webRoot);
		});

		it('includes project root (parent of /web)', () => {
			expect(result).toContain('/home/mg.staging.ly/public_html');
		});

		it('includes /wp candidate (Bedrock core dir within webroot)', () => {
			expect(result).toContain(`${webRoot}/wp`);
		});
	});

	describe('Bedrock core dir input (/web/wp path)', () => {
		const coreDir = '/home/mg.staging.ly/public_html/web/wp';
		let result: string[];
		beforeEach(() => {
			result = expandWordPressPathCandidates([coreDir]);
		});

		it('includes the core dir itself', () => {
			expect(result).toContain(coreDir);
		});

		it('includes the webroot (/web)', () => {
			expect(result).toContain('/home/mg.staging.ly/public_html/web');
		});

		it('includes the project root', () => {
			expect(result).toContain('/home/mg.staging.ly/public_html');
		});
	});

	it('all results start with /', () => {
		const result = expandWordPressPathCandidates([
			'/home/mg/public_html',
			'/home/mg/public_html/web',
		]);
		expect(result.every(p => p.startsWith('/'))).toBe(true);
	});
});

describe('buildWordPressSearchBases', () => {
	it('returns paths and their parents', () => {
		const result = buildWordPressSearchBases(['/home/mg/public_html/web']);
		expect(result).toContain('/home/mg/public_html/web');
		expect(result).toContain('/home/mg/public_html');
	});

	it('excludes overly broad root paths', () => {
		const result = buildWordPressSearchBases(['/home/mg/public_html']);
		expect(result).not.toContain('/');
		expect(result).not.toContain('/home');
		expect(result).not.toContain('/var');
	});

	it('deduplicates', () => {
		const result = buildWordPressSearchBases([
			'/home/mg/site',
			'/home/mg/site',
		]);
		const unique = new Set(result);
		expect(unique.size).toBe(result.length);
	});
});

describe('deriveWordPressRuntimeCandidatesFromPathCandidates', () => {
	it('deduplicates wpRoot+wpPath pairs', () => {
		const result = deriveWordPressRuntimeCandidatesFromPathCandidates([
			'/home/mg/public_html',
			'/home/mg/public_html',
		]);
		const keys = result.map(c => `${c.wpRoot}::${c.wpPath}`);
		const unique = new Set(keys);
		expect(unique.size).toBe(result.length);
	});

	describe('project root input (standard or Bedrock)', () => {
		const projectRoot = '/home/mg.staging.ly/public_html';
		let result: ReturnType<
			typeof deriveWordPressRuntimeCandidatesFromPathCandidates
		>;
		beforeEach(() => {
			result = deriveWordPressRuntimeCandidatesFromPathCandidates([
				projectRoot,
			]);
		});

		it('includes standard candidate (wpRoot = wpPath = project root)', () => {
			expect(result).toEqual(
				expect.arrayContaining([{ wpRoot: projectRoot, wpPath: projectRoot }]),
			);
		});

		it('includes Bedrock /web candidate', () => {
			expect(result).toEqual(
				expect.arrayContaining([
					{ wpRoot: projectRoot, wpPath: `${projectRoot}/web` },
				]),
			);
		});

		it('includes Bedrock /web/wp candidate', () => {
			expect(result).toEqual(
				expect.arrayContaining([
					{ wpRoot: projectRoot, wpPath: `${projectRoot}/web/wp` },
				]),
			);
		});
	});

	describe('/web input (Bedrock webroot)', () => {
		const webRoot = '/home/mg.staging.ly/public_html/web';
		const projectRoot = '/home/mg.staging.ly/public_html';
		let result: ReturnType<
			typeof deriveWordPressRuntimeCandidatesFromPathCandidates
		>;
		beforeEach(() => {
			result = deriveWordPressRuntimeCandidatesFromPathCandidates([webRoot]);
		});

		it('includes candidate with wpRoot=project root and wpPath=webroot', () => {
			expect(result).toEqual(
				expect.arrayContaining([{ wpRoot: projectRoot, wpPath: webRoot }]),
			);
		});

		it('includes candidate with wpRoot=project root and wpPath=web/wp', () => {
			expect(result).toEqual(
				expect.arrayContaining([
					{ wpRoot: projectRoot, wpPath: `${webRoot}/wp` },
				]),
			);
		});

		it('returns web/wp candidate before bare web candidate (so WP-CLI finds core on first attempt)', () => {
			const webWpIndex = result.findIndex(
				c => c.wpRoot === projectRoot && c.wpPath === `${webRoot}/wp`,
			);
			const webIndex = result.findIndex(
				c => c.wpRoot === projectRoot && c.wpPath === webRoot,
			);
			expect(webWpIndex).toBeGreaterThanOrEqual(0);
			expect(webIndex).toBeGreaterThanOrEqual(0);
			expect(webWpIndex).toBeLessThan(webIndex);
		});
	});

	describe('/web/wp input (Bedrock core dir)', () => {
		const coreDir = '/home/mg.staging.ly/public_html/web/wp';
		const projectRoot = '/home/mg.staging.ly/public_html';
		let result: ReturnType<
			typeof deriveWordPressRuntimeCandidatesFromPathCandidates
		>;
		beforeEach(() => {
			result = deriveWordPressRuntimeCandidatesFromPathCandidates([coreDir]);
		});

		it('includes candidate with wpRoot=project root and wpPath=core dir', () => {
			expect(result).toEqual(
				expect.arrayContaining([{ wpRoot: projectRoot, wpPath: coreDir }]),
			);
		});
	});
});

describe('deriveWordPressRuntimeCandidatesFromConfigPaths', () => {
	it('ignores non-wp-config.php paths', () => {
		const result = deriveWordPressRuntimeCandidatesFromConfigPaths([
			'/home/mg/public_html/index.php',
		]);
		expect(result).toHaveLength(0);
	});

	it('deduplicates', () => {
		const result = deriveWordPressRuntimeCandidatesFromConfigPaths([
			'/home/mg/public_html/wp-config.php',
			'/home/mg/public_html/wp-config.php',
		]);
		const keys = result.map(c => `${c.wpRoot}::${c.wpPath}`);
		const unique = new Set(keys);
		expect(unique.size).toBe(result.length);
	});

	describe('wp-config.php at Bedrock project root (not in /web/)', () => {
		const projectRoot = '/home/mg.staging.ly/public_html';
		let result: ReturnType<
			typeof deriveWordPressRuntimeCandidatesFromConfigPaths
		>;
		beforeEach(() => {
			result = deriveWordPressRuntimeCandidatesFromConfigPaths([
				`${projectRoot}/wp-config.php`,
			]);
		});

		it('includes standard candidate (wpRoot = wpPath = projectRoot)', () => {
			expect(result).toEqual(
				expect.arrayContaining([{ wpRoot: projectRoot, wpPath: projectRoot }]),
			);
		});

		it('includes Bedrock /web candidate', () => {
			expect(result).toEqual(
				expect.arrayContaining([
					{ wpRoot: projectRoot, wpPath: `${projectRoot}/web` },
				]),
			);
		});

		it('includes Bedrock /web/wp candidate', () => {
			expect(result).toEqual(
				expect.arrayContaining([
					{ wpRoot: projectRoot, wpPath: `${projectRoot}/web/wp` },
				]),
			);
		});
	});

	describe('wp-config.php inside /web/ (classic Bedrock detection)', () => {
		const projectRoot = '/home/mg.staging.ly/public_html';
		const webDir = `${projectRoot}/web`;
		let result: ReturnType<
			typeof deriveWordPressRuntimeCandidatesFromConfigPaths
		>;
		beforeEach(() => {
			result = deriveWordPressRuntimeCandidatesFromConfigPaths([
				`${webDir}/wp-config.php`,
			]);
		});

		it('includes /web candidate (wpRoot=projectRoot, wpPath=web)', () => {
			expect(result).toEqual(
				expect.arrayContaining([{ wpRoot: projectRoot, wpPath: webDir }]),
			);
		});

		it('includes /web/wp candidate', () => {
			expect(result).toEqual(
				expect.arrayContaining([
					{ wpRoot: projectRoot, wpPath: `${webDir}/wp` },
				]),
			);
		});
	});

	describe('standard WP (wp-config.php at root, no /web/ in path)', () => {
		const wpRoot = '/var/www/html';
		let result: ReturnType<
			typeof deriveWordPressRuntimeCandidatesFromConfigPaths
		>;
		beforeEach(() => {
			result = deriveWordPressRuntimeCandidatesFromConfigPaths([
				`${wpRoot}/wp-config.php`,
			]);
		});

		it('includes standard candidate', () => {
			expect(result).toEqual(
				expect.arrayContaining([{ wpRoot, wpPath: wpRoot }]),
			);
		});
	});
});
