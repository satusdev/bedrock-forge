import { shellQuote, flipProtocol } from './processor-utils';

describe('shellQuote', () => {
	it('wraps a plain string in single quotes', () => {
		expect(shellQuote('hello')).toBe("'hello'");
	});

	it('escapes embedded single quotes', () => {
		expect(shellQuote("it's")).toBe("'it'\\''s'");
	});

	it('handles empty string', () => {
		expect(shellQuote('')).toBe("''");
	});

	it('handles strings with spaces and special chars', () => {
		const result = shellQuote('path with spaces & $VARS');
		expect(result).toBe("'path with spaces & $VARS'");
	});

	it('handles multiple single quotes', () => {
		expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'");
	});
});

describe('flipProtocol', () => {
	it('flips https to http', () => {
		expect(flipProtocol('https://example.com')).toBe('http://example.com');
	});

	it('flips http to https', () => {
		expect(flipProtocol('http://example.com')).toBe('https://example.com');
	});

	it('returns null for non-http/https URL', () => {
		expect(flipProtocol('ftp://example.com')).toBeNull();
	});

	it('returns null for bare domain', () => {
		expect(flipProtocol('example.com')).toBeNull();
	});

	it('preserves path and query string when flipping', () => {
		expect(flipProtocol('https://example.com/path?foo=bar')).toBe(
			'http://example.com/path?foo=bar',
		);
	});
});
