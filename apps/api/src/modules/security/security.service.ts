import { Injectable } from "@nestjs/common";
import { SecurityScanService } from "./security-scan.service";
import { SecurityFindingsService } from "./security-findings.service";
import { SecuritySchedulesService } from "./security-schedules.service";
import { SecurityAlertsService } from "./security-alerts.service";
import type {
  SecurityScanType,
  ServerHardeningActionType,
  EnvironmentHardeningActionType,
} from "@bedrock-forge/shared";
import type { UpsertSecurityScheduleDto } from "./dto/security-schedule.dto";
import type { AckFindingDto, RemoveAckDto } from "./dto/ack-finding.dto";
import type { GenerateSecurityReportDto } from "./dto/generate-security-report.dto";
import type { UpsertServerAlertSettingDto } from "./dto/server-alert-setting.dto";

@Injectable()
export class SecurityService {
  constructor(
    private readonly scanSvc: SecurityScanService,
    private readonly findingsSvc: SecurityFindingsService,
    private readonly schedulesSvc: SecuritySchedulesService,
    private readonly alertsSvc: SecurityAlertsService,
  ) {}

  // ─── Trigger scans ──────────────────────────────────────────────────────────

  async triggerServerScan(
    serverId: number,
    types: ("SSH_AUDIT" | "SERVER_HARDENING" | "MALWARE_SCAN")[],
  ) {
    return this.scanSvc.triggerServerScan(serverId, types);
  }

  async triggerEnvironmentScan(
    environmentId: number,
    types: SecurityScanType[],
  ) {
    return this.scanSvc.triggerEnvironmentScan(environmentId, types);
  }

  // ─── Hardening ───────────────────────────────────────────────────────────────

  async applyServerHardening(
    serverId: number,
    actions: ServerHardeningActionType[],
  ) {
    return this.scanSvc.applyServerHardening(serverId, actions);
  }

  async applyEnvironmentHardening(
    environmentId: number,
    actions: EnvironmentHardeningActionType[],
  ) {
    return this.scanSvc.applyEnvironmentHardening(environmentId, actions);
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  async getScanById(id: number) {
    return this.findingsSvc.getScanById(id);
  }

  async getServerScanHistory(serverId: number, page: number, limit: number) {
    return this.findingsSvc.getServerScanHistory(serverId, page, limit);
  }

  async getEnvironmentScanHistory(
    environmentId: number,
    page: number,
    limit: number,
  ) {
    return this.findingsSvc.getEnvironmentScanHistory(
      environmentId,
      page,
      limit,
    );
  }

  async getOverview() {
    return this.findingsSvc.getOverview();
  }

  async getServersList() {
    return this.findingsSvc.getServersList();
  }

  async getSecurityLogs(
    filter: { server_id?: number; date_from?: string; date_to?: string },
    page: number,
    limit: number,
  ) {
    return this.findingsSvc.getSecurityLogs(filter, page, limit);
  }

  // ─── Schedules ───────────────────────────────────────────────────────────────

  async getServerSchedule(serverId: number) {
    return this.schedulesSvc.getServerSchedule(serverId);
  }

  async upsertServerSchedule(serverId: number, dto: UpsertSecurityScheduleDto) {
    return this.schedulesSvc.upsertServerSchedule(serverId, dto);
  }

  async deleteServerSchedule(serverId: number) {
    return this.schedulesSvc.deleteServerSchedule(serverId);
  }

  async getEnvironmentSchedule(environmentId: number) {
    return this.schedulesSvc.getEnvironmentSchedule(environmentId);
  }

  async upsertEnvironmentSchedule(
    environmentId: number,
    dto: UpsertSecurityScheduleDto,
  ) {
    return this.schedulesSvc.upsertEnvironmentSchedule(environmentId, dto);
  }

  async deleteEnvironmentSchedule(environmentId: number) {
    return this.schedulesSvc.deleteEnvironmentSchedule(environmentId);
  }

  // ─── Server Security Alerts ────────────────────────────────────────────────

  async getServerAlertSetting(serverId: number) {
    return this.alertsSvc.getServerAlertSetting(serverId);
  }

  async upsertServerAlertSetting(
    serverId: number,
    dto: UpsertServerAlertSettingDto,
  ) {
    return this.alertsSvc.upsertServerAlertSetting(serverId, dto);
  }

  async testServerAlertSetting(serverId: number) {
    return this.alertsSvc.testServerAlertSetting(serverId);
  }

  // ─── Security settings (IP allowlist via AppSettings) ────────────────────────

  async getSecuritySettings(settingsSvc: {
    get: (key: string) => Promise<{ key: string; value?: string } | null>;
  }) {
    const [allowlist, threshold] = await Promise.all([
      settingsSvc.get("security_ip_allowlist"),
      settingsSvc.get("security_notify_threshold"),
    ]);
    return {
      ip_allowlist: allowlist?.value
        ? (JSON.parse(allowlist.value) as string[])
        : [],
      notify_threshold: threshold?.value ?? "critical",
    };
  }

  async setSecuritySettings(
    settingsSvc: {
      set: (key: string, value: string) => Promise<unknown>;
    },
    ip_allowlist: string[],
    notify_threshold: string,
  ) {
    await Promise.all([
      settingsSvc.set("security_ip_allowlist", JSON.stringify(ip_allowlist)),
      settingsSvc.set("security_notify_threshold", notify_threshold),
    ]);
    return { success: true };
  }

  // ─── Aggregated Findings + Acknowledgements ───────────────────────────────────

  async getAggregatedFindings(
    filters: {
      severity?: string;
      server_id?: number;
      environment_id?: number;
      scan_type?: string;
      acknowledged?: boolean;
    },
    page: number,
    limit: number,
  ) {
    return this.findingsSvc.getAggregatedFindings(filters, page, limit);
  }

  async acknowledgeFinding(userId: number, dto: AckFindingDto) {
    return this.findingsSvc.acknowledgeFinding(userId, dto);
  }

  async removeAcknowledgement(dto: RemoveAckDto) {
    return this.findingsSvc.removeAcknowledgement(dto);
  }

  // ─── Security Reports ────────────────────────────────────────────────────

  async generateSecurityReport(dto: GenerateSecurityReportDto) {
    return this.findingsSvc.generateSecurityReport(dto);
  }

  async getSecurityReportHistory() {
    return this.findingsSvc.getSecurityReportHistory();
  }
}
