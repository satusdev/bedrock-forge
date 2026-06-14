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
    } as unknown as jest.Mocked<SearchRepository>;
    service = new SearchService(repo);
  });

  it("returns visible static pages for blank queries", async () => {
    repo.findClients.mockResolvedValue([]);

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
});
