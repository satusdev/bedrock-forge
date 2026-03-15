import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { MalformedJsonExceptionFilter } from './malformed-json.filter';

describe('MalformedJsonExceptionFilter', () => {
	it('returns malformed JSON detail for parser failures', () => {
		const filter = new MalformedJsonExceptionFilter();
		const json = jest.fn();
		const status = jest.fn().mockReturnValue({ json });
		const response = { status };
		const host = {
			switchToHttp: () => ({
				getResponse: () => response,
			}),
		} as unknown as ArgumentsHost;

		const error = Object.assign(new SyntaxError('Unexpected token'), {
			status: 400,
			type: 'entity.parse.failed',
		});

		filter.catch(error, host);

		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({ detail: 'Malformed JSON body' });
	});

	it('returns invalid payload detail for other syntax errors', () => {
		const filter = new MalformedJsonExceptionFilter();
		const json = jest.fn();
		const status = jest.fn().mockReturnValue({ json });
		const response = { status };
		const host = {
			switchToHttp: () => ({
				getResponse: () => response,
			}),
		} as unknown as ArgumentsHost;

		filter.catch(new SyntaxError('Bad payload'), host);

		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({ detail: 'Invalid request payload' });
	});

	it('normalizes parser-like BadRequestException payloads', () => {
		const filter = new MalformedJsonExceptionFilter();
		const json = jest.fn();
		const status = jest.fn().mockReturnValue({ json });
		const response = { status };
		const host = {
			switchToHttp: () => ({
				getResponse: () => response,
			}),
		} as unknown as ArgumentsHost;

		filter.catch(
			new BadRequestException({
				message: 'Unexpected end of JSON input',
				error: 'Bad Request',
				statusCode: 400,
			}),
			host,
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({ detail: 'Malformed JSON body' });
	});

	it('normalizes parser-like BadRequestException for expected-token JSON errors', () => {
		const filter = new MalformedJsonExceptionFilter();
		const json = jest.fn();
		const status = jest.fn().mockReturnValue({ json });
		const response = { status };
		const host = {
			switchToHttp: () => ({
				getResponse: () => response,
			}),
		} as unknown as ArgumentsHost;

		filter.catch(
			new BadRequestException({
				message:
					"Expected ':' after property name in JSON at position 10 (line 1 column 11)",
				error: 'Bad Request',
				statusCode: 400,
			}),
			host,
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({ detail: 'Malformed JSON body' });
	});

	it('passes through non-parser BadRequestException payloads', () => {
		const filter = new MalformedJsonExceptionFilter();
		const json = jest.fn();
		const status = jest.fn().mockReturnValue({ json });
		const response = { status };
		const host = {
			switchToHttp: () => ({
				getResponse: () => response,
			}),
		} as unknown as ArgumentsHost;

		filter.catch(
			new BadRequestException({
				message: 'project_id must be a positive integer',
				error: 'Bad Request',
				statusCode: 400,
			}),
			host,
		);

		expect(status).toHaveBeenCalledWith(400);
		expect(json).toHaveBeenCalledWith({
			message: 'project_id must be a positive integer',
			error: 'Bad Request',
			statusCode: 400,
		});
	});
});
