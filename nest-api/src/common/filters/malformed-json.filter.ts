import {
	ArgumentsHost,
	BadRequestException,
	Catch,
	ExceptionFilter,
	HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

type MalformedJsonError = SyntaxError & {
	status?: number;
	type?: string;
	body?: unknown;
};

@Catch(SyntaxError, BadRequestException)
export class MalformedJsonExceptionFilter implements ExceptionFilter {
	private toMessageText(value: unknown) {
		if (typeof value === 'string') {
			return value;
		}
		if (Array.isArray(value)) {
			return value
				.filter((entry): entry is string => typeof entry === 'string')
				.join(' ');
		}
		return '';
	}

	private isMalformedJsonMessage(message: string) {
		return /((Unexpected|Expected) .*JSON|in JSON at position|Malformed JSON)/i.test(
			message,
		);
	}

	catch(exception: unknown, host: ArgumentsHost) {
		const response = host.switchToHttp().getResponse<Response>();

		if (exception instanceof SyntaxError) {
			const error = exception as MalformedJsonError;
			const isParserError =
				error.status === HttpStatus.BAD_REQUEST &&
				error.type === 'entity.parse.failed';

			if (isParserError || this.isMalformedJsonMessage(exception.message)) {
				response.status(HttpStatus.BAD_REQUEST).json({
					detail: 'Malformed JSON body',
				});
				return;
			}

			response.status(HttpStatus.BAD_REQUEST).json({
				detail: 'Invalid request payload',
			});
			return;
		}

		if (exception instanceof BadRequestException) {
			const body = exception.getResponse();
			const message =
				typeof body === 'string'
					? body
					: this.toMessageText((body as { message?: unknown })?.message);
			if (this.isMalformedJsonMessage(message)) {
				response.status(HttpStatus.BAD_REQUEST).json({
					detail: 'Malformed JSON body',
				});
				return;
			}

			response.status(exception.getStatus()).json(body);
			return;
		}

		response.status(HttpStatus.BAD_REQUEST).json({
			detail: 'Invalid request payload',
		});
	}
}
