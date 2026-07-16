import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { DomainsService } from "./domains.service";
import { DomainsRepository } from "./domains.repository";
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from "@bedrock-forge/shared";

function makeRepo() {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findAllRaw: jest.fn(),
  };
}

function makeQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: "job-abc" }),
  };
}

describe("DomainsService", () => {
  let svc: DomainsService;
  let repo: ReturnType<typeof makeRepo>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(async () => {
    repo = makeRepo();
    queue = makeQueue();

    const module = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: DomainsRepository, useValue: repo },
        { provide: getQueueToken(QUEUES.DOMAINS), useValue: queue },
      ],
    }).compile();

    svc = module.get(DomainsService);
  });

  describe("refreshAllDomains", () => {
    it("should enqueue WHOIS and SSL check jobs for all domains in the database", async () => {
      const domains = [
        { id: BigInt(1), name: "alnosd.org" },
        { id: BigInt(2), name: "sahem.ly" },
      ];
      repo.findAllRaw.mockResolvedValue(domains);

      await svc.refreshAllDomains();

      expect(repo.findAllRaw).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledTimes(4); // 2 domains * 2 checks each = 4 jobs enqueued

      expect(queue.add).toHaveBeenNthCalledWith(
        1,
        JOB_TYPES.DOMAIN_WHOIS,
        { domainId: 1, domain: "alnosd.org" },
        DEFAULT_JOB_OPTIONS,
      );
      expect(queue.add).toHaveBeenNthCalledWith(
        2,
        JOB_TYPES.DOMAIN_SSL_CHECK,
        { domainId: 1, domain: "alnosd.org" },
        DEFAULT_JOB_OPTIONS,
      );
      expect(queue.add).toHaveBeenNthCalledWith(
        3,
        JOB_TYPES.DOMAIN_WHOIS,
        { domainId: 2, domain: "sahem.ly" },
        DEFAULT_JOB_OPTIONS,
      );
      expect(queue.add).toHaveBeenNthCalledWith(
        4,
        JOB_TYPES.DOMAIN_SSL_CHECK,
        { domainId: 2, domain: "sahem.ly" },
        DEFAULT_JOB_OPTIONS,
      );
    });

    it("should log and return if no domains are returned", async () => {
      repo.findAllRaw.mockResolvedValue([]);

      await svc.refreshAllDomains();

      expect(repo.findAllRaw).toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
