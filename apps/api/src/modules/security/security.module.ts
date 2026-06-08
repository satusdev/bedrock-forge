import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUES } from "@bedrock-forge/shared";
import { SecurityController } from "./security.controller";
import { SecurityService } from "./security.service";
import { SecurityScanService } from "./security-scan.service";
import { SecurityFindingsService } from "./security-findings.service";
import { SecuritySchedulesService } from "./security-schedules.service";
import { SecurityAlertsService } from "./security-alerts.service";
import { SecurityRepository } from "./security.repository";
import { SettingsModule } from "../settings/settings.module";
import { VulnerabilityDbService } from "./vulnerability-db.service";
import { JobExecutionsModule } from "../job-executions/job-executions.module";

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.SECURITY }),
    BullModule.registerQueue({ name: QUEUES.REPORTS }),
    BullModule.registerQueue({ name: QUEUES.NOTIFICATIONS }),
    SettingsModule,
    JobExecutionsModule,
  ],
  controllers: [SecurityController],
  providers: [
    SecurityService,
    SecurityScanService,
    SecurityFindingsService,
    SecuritySchedulesService,
    SecurityAlertsService,
    SecurityRepository,
    VulnerabilityDbService,
  ],
  exports: [
    SecurityService,
    SecurityScanService,
    SecurityFindingsService,
    SecuritySchedulesService,
    SecurityAlertsService,
    VulnerabilityDbService,
  ],
})
export class SecurityModule {}
