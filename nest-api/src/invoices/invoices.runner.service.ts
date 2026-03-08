import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoicesRunnerService {
	private readonly logger = new Logger(InvoicesRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.INVOICE_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			1000,
			Number.parseInt(process.env.INVOICE_RUNNER_BATCH_SIZE ?? '100', 10) ||
				100,
		),
	);

	constructor(private readonly invoicesService: InvoicesService) {}

	@Interval(300_000)
	async markOverdueInvoices() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		try {
			await this.invoicesService.markOverdueInvoices(this.batchSize);
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : 'Unknown invoice runner error';
			this.logger.error(`Invoice overdue sweep failed in runner: ${detail}`);
		} finally {
			this.isProcessing = false;
		}
	}
}
