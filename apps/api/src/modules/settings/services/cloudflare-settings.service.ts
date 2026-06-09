import { BadRequestException, Injectable } from "@nestjs/common";
import { SettingsRepository } from "../settings.repository";
import { EncryptionService } from "../../../common/encryption/encryption.service";
import { UpdateCloudflareDnsRecordDto } from "../dto/cloudflare-settings.dto";

@Injectable()
export class CloudflareSettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly enc: EncryptionService,
  ) {}

  async getCloudflareConfig() {
    const tokenSetting = await this.repo.findByKey("cloudflare_api_token");
    const zone = await this.repo.findByKey("cloudflare_zone_id");
    const zoneName = await this.repo.findByKey("cloudflare_zone_name");
    return {
      configured: !!tokenSetting,
      zone_id: zone?.value ?? null,
      zone_name: zoneName?.value ?? null,
    };
  }

  async setCloudflareConfig(dto: {
    api_token: string;
    zone_id: string;
    zone_name?: string;
  }) {
    const encryptedToken = this.enc.encrypt(dto.api_token.trim());
    await Promise.all([
      this.repo.upsert("cloudflare_api_token", encryptedToken),
      this.repo.upsert("cloudflare_zone_id", dto.zone_id.trim()),
      this.repo.upsert("cloudflare_zone_name", dto.zone_name?.trim() ?? ""),
    ]);
  }

  async deleteCloudflareConfig() {
    await Promise.all([
      this.repo.delete("cloudflare_api_token").catch(() => undefined),
      this.repo.delete("cloudflare_zone_id").catch(() => undefined),
      this.repo.delete("cloudflare_zone_name").catch(() => undefined),
    ]);
  }

  async testCloudflare() {
    const { token, zoneId } = await this.getCloudflareCredentials();
    const result = await this.cloudflareFetch(token, `/zones/${zoneId}`);
    return {
      success: true,
      message: `Connected to ${result.result?.name ?? zoneId}`,
      zone: result.result,
    };
  }

  async listCloudflareDnsRecords() {
    const { token, zoneId } = await this.getCloudflareCredentials();
    const result = await this.cloudflareFetch(
      token,
      `/zones/${zoneId}/dns_records?per_page=100`,
    );
    return result.result ?? [];
  }

  async updateCloudflareDnsRecord(
    recordId: string,
    dto: UpdateCloudflareDnsRecordDto,
  ) {
    const { token, zoneId } = await this.getCloudflareCredentials();
    const existing = await this.cloudflareFetch(
      token,
      `/zones/${zoneId}/dns_records/${recordId}`,
    );
    const current = existing.result;
    const payload = {
      type: dto.type ?? current.type,
      name: dto.name ?? current.name,
      content: dto.content ?? current.content,
      ttl: current.ttl ?? 1,
      proxied: dto.proxied ?? current.proxied ?? false,
    };
    const result = await this.cloudflareFetch(
      token,
      `/zones/${zoneId}/dns_records/${recordId}`,
      { method: "PUT", body: JSON.stringify(payload) },
    );
    return result.result;
  }

  async purgeCloudflareCache() {
    const { token, zoneId } = await this.getCloudflareCredentials();
    const result = await this.cloudflareFetch(
      token,
      `/zones/${zoneId}/purge_cache`,
      { method: "POST", body: JSON.stringify({ purge_everything: true }) },
    );
    return { success: !!result.success };
  }

  async setCloudflareDevelopmentMode(enabled: boolean) {
    const { token, zoneId } = await this.getCloudflareCredentials();
    const result = await this.cloudflareFetch(
      token,
      `/zones/${zoneId}/settings/development_mode`,
      {
        method: "PATCH",
        body: JSON.stringify({ value: enabled ? "on" : "off" }),
      },
    );
    return result.result;
  }

  private async getCloudflareCredentials() {
    const tokenSetting = await this.repo.findByKey("cloudflare_api_token");
    const zoneSetting = await this.repo.findByKey("cloudflare_zone_id");
    if (!tokenSetting || !zoneSetting?.value) {
      throw new BadRequestException("Cloudflare is not configured.");
    }
    try {
      const token = this.enc.decrypt(tokenSetting.value);
      return { token, zoneId: zoneSetting.value };
    } catch {
      throw new BadRequestException("Failed to decrypt Cloudflare credentials.");
    }
  }

  private async cloudflareFetch(
    token: string,
    path: string,
    init: RequestInit = {},
  ): Promise<any> {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || payload?.success === false) {
      const message =
        payload?.errors?.[0]?.message ??
        res.statusText ??
        "Cloudflare request failed";
      throw new BadRequestException(message);
    }
    return payload;
  }
}
