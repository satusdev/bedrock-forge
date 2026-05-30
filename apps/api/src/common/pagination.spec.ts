/// <reference types="jest" />

import {
	MAX_PAGE_SIZE,
	MAX_TIMESERIES_PAGE_SIZE,
	normalizePage,
	normalizePageSize,
} from './pagination';

describe('pagination helpers', () => {
	it('normalizes invalid page values to page 1', () => {
		expect(normalizePage(undefined)).toBe(1);
		expect(normalizePage('abc')).toBe(1);
		expect(normalizePage('0')).toBe(1);
		expect(normalizePage(-4)).toBe(1);
	});

	it('preserves valid positive integer pages', () => {
		expect(normalizePage('3')).toBe(3);
		expect(normalizePage(12.9)).toBe(12);
	});

	it('caps standard page sizes at the global maximum', () => {
		expect(normalizePageSize(undefined)).toBe(20);
		expect(normalizePageSize('0')).toBe(1);
		expect(normalizePageSize('9999')).toBe(MAX_PAGE_SIZE);
	});

	it('supports explicit defaults and maximums for time-series endpoints', () => {
		expect(normalizePageSize(undefined, 100, MAX_TIMESERIES_PAGE_SIZE)).toBe(
			100,
		);
		expect(normalizePageSize('500', 100, MAX_TIMESERIES_PAGE_SIZE)).toBe(
			MAX_TIMESERIES_PAGE_SIZE,
		);
	});
});
