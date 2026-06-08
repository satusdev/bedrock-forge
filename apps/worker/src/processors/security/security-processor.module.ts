import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { SecurityServerScanProcessor } from "./security-server-scan.processor";
import { SecurityAlertPollerService } from "./security-alert-poller.service";
import { SecurityAttackWatcherService } from "./security-attack-watcher.service";
import { SecurityScanRunnerService } from "./services/security-scan-runner.service";
import { SecuritySchedulerService } from "./services/security-scheduler.service";
import { SecurityHardeningService } from "./services/security-hardening.service";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.SECURITY },
      { name: QUEUES.NOTIFICATIONS },
    ),
  ],
  providers: [
    // SecurityServerScanProcessor is the unified SecurityScanProcessor —
    // it handles all QUEUES.SECURITY job types (server scan, env scan, schedule tick).
    // Having multiple @Processor classes on the same queue would create a fatal
    // race condition where workers compete for jobs and silently drop them.
    SecurityServerScanProcessor,
    SecurityAlertPollerService,
    SecurityAttackWatcherService,
    SecurityScanRunnerService,
    SecuritySchedulerService,
    SecurityHardeningService,
  ],
})
export class SecurityProcessorModule {}
