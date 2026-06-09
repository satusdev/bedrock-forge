import { describe, it, expect } from "vitest";
import { durationLabel, jobTypeLabel } from "./utils";
import { JobExecutionRow } from "./types";

describe("sync/utils", () => {
  describe("durationLabel", () => {
    it("returns dash when started is missing", () => {
      expect(durationLabel()).toBe("\u2014");
    });

    it("calculates duration under 1 second", () => {
      const now = new Date();
      const started = new Date(now.getTime() - 500).toISOString();
      const completed = now.toISOString();
      expect(durationLabel(started, completed)).toContain("500ms");
    });

    it("calculates duration under 1 minute", () => {
      const now = new Date();
      const started = new Date(now.getTime() - 25000).toISOString();
      const completed = now.toISOString();
      expect(durationLabel(started, completed)).toBe("25.0s");
    });

    it("calculates duration over 1 minute", () => {
      const now = new Date();
      const started = new Date(now.getTime() - 75000).toISOString();
      const completed = now.toISOString();
      expect(durationLabel(started, completed)).toBe("1m 15s");
    });
  });

  describe("jobTypeLabel", () => {
    it("identifies sync:push", () => {
      const row: JobExecutionRow = {
        id: 1,
        queue_name: "sync",
        job_type: "sync:push",
        status: "completed",
        progress: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        created_at: "",
        environment: null,
      };
      expect(jobTypeLabel(row)).toBe("Push");
    });

    it("identifies sync:clone", () => {
      const row: JobExecutionRow = {
        id: 2,
        queue_name: "sync",
        job_type: "sync:clone",
        status: "completed",
        progress: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        created_at: "",
        environment: null,
      };
      expect(jobTypeLabel(row)).toBe("Clone");
    });

    it("falls back to environment type", () => {
      const row: JobExecutionRow = {
        id: 3,
        queue_name: "sync",
        job_type: "other",
        status: "completed",
        progress: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        created_at: "",
        environment: { id: 1, type: "production", url: null, project: { id: 1, name: "P", client: { id: 1, name: "C" } } },
      };
      expect(jobTypeLabel(row)).toBe("production");
    });
  });
});
