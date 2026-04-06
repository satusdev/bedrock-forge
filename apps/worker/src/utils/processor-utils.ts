/**
 * Wrap a string in single quotes for safe shell embedding.
 * Single quotes inside the value are escaped as: ' -> '\''
 */
export function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

/**
 * Flip http↔https on a URL string.
 * Returns null if the URL doesn't start with http:// or https://.
 */
export function flipProtocol(url: string): string | null {
	if (url.startsWith('https://')) return 'http://' + url.slice(8);
	if (url.startsWith('http://')) return 'https://' + url.slice(7);
	return null;
}
