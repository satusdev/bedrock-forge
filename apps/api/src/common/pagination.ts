export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_TIMESERIES_PAGE_SIZE = 200;

export function clampPositiveInt(
	value: number | string | null | undefined,
	defaultValue: number,
	maxValue: number,
): number {
	const parsed =
		typeof value === 'string'
			? Number.parseInt(value, 10)
			: typeof value === 'number'
				? value
				: Number.NaN;

	if (!Number.isFinite(parsed)) return defaultValue;
	return Math.min(maxValue, Math.max(1, Math.floor(parsed)));
}

export function normalizePage(value: number | string | null | undefined) {
	return clampPositiveInt(value, DEFAULT_PAGE, Number.MAX_SAFE_INTEGER);
}

export function normalizePageSize(
	value: number | string | null | undefined,
	defaultValue = DEFAULT_PAGE_SIZE,
	maxValue = MAX_PAGE_SIZE,
) {
	return clampPositiveInt(value, defaultValue, maxValue);
}
