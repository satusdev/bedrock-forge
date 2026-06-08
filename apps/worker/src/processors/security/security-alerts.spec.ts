import { SecurityAlertPollerService } from "./security-alert-poller.service";

describe("Security alert snapshot comparison", () => {
  function makeService() {
    return new SecurityAlertPollerService(
      {} as any,
      {} as any,
      {} as any,
    ) as any;
  }

  it("batches file additions, modifications, and deletions", () => {
    const service = makeService();
    const previous = {
      "/etc/ssh/sshd_config": { hash: "a", size: 10, mtime: 1 },
      "/etc/sudoers": { hash: "b", size: 20, mtime: 1 },
      "/root/.ssh/authorized_keys": { hash: "c", size: 30, mtime: 1 },
    };
    const next = {
      "/etc/ssh/sshd_config": { hash: "a", size: 10, mtime: 1 },
      "/etc/sudoers": { hash: "changed", size: 22, mtime: 2 },
      "/etc/cron.d/new-job": { hash: "d", size: 40, mtime: 1 },
    };

    expect(service.compareSnapshots(previous, next)).toEqual({
      added: ["/etc/cron.d/new-job"],
      modified: ["/etc/sudoers"],
      deleted: ["/root/.ssh/authorized_keys"],
    });
  });

  it("does not alert on the initial snapshot baseline", () => {
    const service = makeService();

    expect(
      service.hasFileChanges(
        service.compareSnapshots(null, {
          "/etc/ssh/sshd_config": { hash: "a", size: 10, mtime: 1 },
        }),
      ),
    ).toBe(false);
  });

  it("excludes noisy paths from remote scans by default", () => {
    const service = makeService();
    const command = service.buildFileSnapshotCommand(["/var/www/site"]);

    expect(command).toContain("*/vendor/*");
    expect(command).toContain("*/node_modules/*");
    expect(command).toContain("*/cache/*");
    expect(command).toContain("*/backups/*");
    expect(command).toContain("*/logs/*");
    expect(command).toContain("*/uploads/*");
  });
});
