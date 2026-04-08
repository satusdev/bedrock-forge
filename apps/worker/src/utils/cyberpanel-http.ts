import { request as httpRequest, IncomingMessage } from 'node:http';
import { request as httpsRequest, RequestOptions } from 'node:https';

/** Credentials for a CyberPanel admin API connection. */
export interface CpCreds {
	url: string;
	username: string;
	password: string;
}

/**
 * Escape a value for safe interpolation into a MySQL string literal.
 * Used when building inline SQL — always paired with explicit quoting.
 */
export function escapeMysql(str: string): string {
	return str
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\0/g, '\\0')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

/**
 * Execute a CyberPanel REST API call over HTTP/HTTPS.
 *
 * Credentials are injected as `adminUser` + `adminPass` into the JSON body.
 * Self-signed certificates are accepted (`rejectUnauthorized: false`) since
 * CyberPanel instances commonly use self-signed TLS on private networks.
 *
 * Rejects with an Error if CyberPanel returns `{ status: 0 }`.
 */
export function callCpApi(
	creds: CpCreds,
	endpoint: string,
	body: Record<string, unknown>,
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const base = creds.url.replace(/\/$/, '');
		const payload = JSON.stringify({
			adminUser: creds.username,
			adminPass: creds.password,
			...body,
		});

		const isHttps = base.startsWith('https://');
		const url = new URL(`${base}${endpoint}`);

		const opts: RequestOptions = {
			hostname: url.hostname,
			port: url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80,
			path: url.pathname + url.search,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(payload),
			},
			rejectUnauthorized: false,
		};

		const req = isHttps
			? httpsRequest(opts, handleResp)
			: httpRequest(opts, handleResp);

		function handleResp(res: IncomingMessage) {
			const chunks: Buffer[] = [];
			res.on('data', (c: Buffer) => chunks.push(c));
			res.on('end', () => {
				const raw = Buffer.concat(chunks).toString();

				// Reject early on non-2xx HTTP status (e.g. 401 HTML auth page)
				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					reject(
						new Error(
							`CyberPanel ${endpoint} HTTP ${res.statusCode}: ${raw.slice(0, 300)}`,
						),
					);
					return;
				}

				try {
					const data = JSON.parse(raw) as Record<string, unknown>;
					if (data.status === 0) {
						const msg =
							(data.error_message as string) ||
							(data.errorMessage as string) ||
							JSON.stringify(data);
						reject(new Error(`CyberPanel ${endpoint} failed: ${msg}`));
					} else {
						resolve(data);
					}
				} catch (e) {
					reject(
						new Error(
							`CyberPanel ${endpoint} response parse error: ${e}\nBody: ${raw.slice(0, 300)}`,
						),
					);
				}
			});
		}

		req.on('error', reject);
		req.write(payload);
		req.end();
	});
}
