import { SearchService } from "./search.service";
import { SearchRepository } from "./search.repository";

describe("SearchService", () => {
  let repo: jest.Mocked<SearchRepository>;
  let service: SearchService;

  beforeEach(() => {
    repo = {
      findClients: jest.fn(),
      findProjects: jest.fn(),
      findEnvironments: jest.fn(),
      findServers: jest.fn(),
      findDomains: jest.fn(),
      findMonitors: jest.fn(),
      findJobs: jest.fn(),
      findLatestSecurityScansWithFindings: jest.fn(),
    } as unknown as jest.Mocked<SearchRepository>;
    repo.findClients.mockResolvedValue([]);
    repo.findProjects.mockResolvedValue([]);
    repo.findEnvironments.mockResolvedValue([]);
    repo.findServers.mockResolvedValue([]);
    repo.findDomains.mockResolvedValue([]);
    repo.findMonitors.mockResolvedValue([]);
    repo.findJobs.mockResolvedValue([]);
    repo.findLatestSecurityScansWithFindings.mockResolvedValue([]);
    service = new SearchService(repo);
  });

  it("returns visible static pages for blank queries", async () => {
    const result = await service.search({
      query: "",
      roles: ["maintainer"],
      limit: 8,
    });

    expect(result.items.some((item) => item.path === "/dashboard")).toBe(true);
    expect(result.items.some((item) => item.path === "/users")).toBe(false);
    expect(repo.findProjects).not.toHaveBeenCalled();
  });

  it("searches projects, environments, servers, and clients for managers", async () => {
    repo.findProjects.mockResolvedValue([
      {
        id: BigInt(7),
        name: "Acme Site",
        client: { name: "Acme" },
        _count: { environments: 2 },
      },
    ]);
    repo.findEnvironments.mockResolvedValue([
      {
        id: BigInt(11),
        type: "production",
        url: "https://acme.test",
        project: { id: BigInt(7), name: "Acme Site" },
        server: { name: "prod-1" },
      },
    ]);
    repo.findServers.mockResolvedValue([
      {
        id: BigInt(3),
        name: "prod-1",
        ip_address: "192.0.2.10",
        provider: "hetzner",
      },
    ]);
    repo.findDomains.mockResolvedValue([
      {
        id: BigInt(4),
        name: "acme.test",
        expires_at: new Date("2026-12-31T00:00:00.000Z"),
      },
    ]);
    repo.findMonitors.mockResolvedValue([
      {
        id: BigInt(8),
        enabled: true,
        last_status: 200,
        environment: {
          id: BigInt(11),
          type: "production",
          url: "https://acme.test",
          project: { id: BigInt(7), name: "Acme Site" },
        },
      },
    ]);
    repo.findJobs.mockResolvedValue([
      {
        id: BigInt(12),
        queue_name: "security",
        job_type: "environment-harden",
        status: "completed",
        environment: {
          id: BigInt(11),
          type: "production",
          url: "https://acme.test",
          project: { id: BigInt(7), name: "Acme Site" },
        },
        server: null,
      },
    ]);
    repo.findClients.mockResolvedValue([
      { id: BigInt(5), name: "Acme", email: "ops@example.com" },
    ]);

    const result = await service.search({
      query: "acme",
      roles: ["manager"],
      limit: 8,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project",
          path: "/projects/7",
        }),
        expect.objectContaining({
          type: "environment",
          path: "/projects/7?tab=environments&env=11",
        }),
        expect.objectContaining({
          type: "server",
          path: "/servers/3",
        }),
        expect.objectContaining({
          type: "domain",
          path: "/domains?search=acme.test",
        }),
        expect.objectContaining({
          type: "monitor",
          path: "/monitors?search=https%3A%2F%2Facme.test",
        }),
        expect.objectContaining({
          type: "job",
          path: "/activity?job=12",
        }),
        expect.objectContaining({
          type: "client",
          path: "/clients/5",
        }),
      ]),
    );
  });

  it("returns matching project tab shortcuts for project results", async () => {
    repo.findProjects.mockResolvedValue([
      {
        id: BigInt(9),
        name: "Composer Site",
        client: { name: "Client" },
        _count: { environments: 1 },
      },
    ]);
    repo.findEnvironments.mockResolvedValue([]);
    repo.findServers.mockResolvedValue([]);
    repo.findClients.mockResolvedValue([]);

    const result = await service.search({
      query: "composer",
      roles: ["manager"],
      limit: 8,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "project_tab",
          path: "/projects/9?tab=plugins",
        }),
      ]),
    );
  });

  it("returns matching security findings", async () => {
    repo.findLatestSecurityScansWithFindings.mockResolvedValue([
      {
        id: BigInt(22),
        scan_type: "WP_AUDIT",
        findings: [
          {
            id: "composer",
            severity: "critical",
            category: "VERSION_DISCLOSURE",
            title: "composer.json is publicly accessible",
            description: "Package metadata is exposed.",
            resource: "/app/composer.json",
          },
        ],
        server: null,
        environment: {
          id: BigInt(11),
          type: "staging",
          project: { id: BigInt(7), name: "Acme Site" },
        },
      },
    ]);

    const result = await service.search({
      query: "composer",
      roles: ["manager"],
      limit: 8,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "finding",
          path: "/projects/7?tab=security&env=11",
        }),
      ]),
    );
  });
});
