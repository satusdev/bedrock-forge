import { Test } from "@nestjs/testing";
import { RemoteOpsRepository } from "./remote-ops.repository";
import { PrismaService } from "../../prisma/prisma.service";

const makePrisma = () => ({
  auditLog: {
    create: jest.fn(),
  },
  envVariableTemplate: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
  },
  environment: {
    findUnique: jest.fn(),
  },
  resourceNote: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  server: {
    findUnique: jest.fn(),
  },
});

describe("RemoteOpsRepository", () => {
  let repository: RemoteOpsRepository;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module = await Test.createTestingModule({
      providers: [
        RemoteOpsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get(RemoteOpsRepository);
  });

  describe("createAuditLog", () => {
    it("creates audit log row and catches errors", async () => {
      prisma.auditLog.create.mockResolvedValue({ id: 1 });
      const data = {
        user_id: BigInt(1),
        action: "action",
        resource_type: "environment",
        resource_id: BigInt(2),
        metadata: {},
      };
      await repository.createAuditLog(data);
      expect(prisma.auditLog.create).toHaveBeenCalledWith({ data });
    });
  });

  describe("findTemplatesByEnvType", () => {
    it("queries matching env templates", async () => {
      prisma.envVariableTemplate.findMany.mockResolvedValue([]);
      await repository.findTemplatesByEnvType("production");
      expect(prisma.envVariableTemplate.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ environment_type: null }, { environment_type: "production" }],
        },
        orderBy: [{ environment_type: "asc" }, { name: "asc" }],
      });
    });
  });

  describe("findProjectById", () => {
    it("queries project", async () => {
      prisma.project.findUnique.mockResolvedValue({ id: BigInt(1) });
      await repository.findProjectById(1);
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: BigInt(1) },
        select: { id: true },
      });
    });
  });

  describe("findEnvironmentById", () => {
    it("queries environment select project_id and type", async () => {
      prisma.environment.findUnique.mockResolvedValue({ project_id: BigInt(1), type: "staging" });
      await repository.findEnvironmentById(2);
      expect(prisma.environment.findUnique).toHaveBeenCalledWith({
        where: { id: BigInt(2) },
        select: { project_id: true, type: true },
      });
    });
  });

  describe("resourceExists", () => {
    it("returns true if project exists", async () => {
      prisma.project.findUnique.mockResolvedValue({ id: BigInt(1) });
      const res = await repository.resourceExists("project", "1");
      expect(res).toBe(true);
    });

    it("returns true if environment exists", async () => {
      prisma.environment.findUnique.mockResolvedValue({ id: BigInt(2) });
      const res = await repository.resourceExists("environment", "2");
      expect(res).toBe(true);
    });

    it("returns true if server exists", async () => {
      prisma.server.findUnique.mockResolvedValue({ id: BigInt(3) });
      const res = await repository.resourceExists("server", "3");
      expect(res).toBe(true);
    });
  });
});
