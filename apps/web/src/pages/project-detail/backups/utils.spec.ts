import { describe, it, expect } from "vitest";
import { formatBytes } from "./utils";

describe("backups/utils", () => {
  describe("formatBytes", () => {
    it("formats bytes correctly", () => {
      expect(formatBytes(500)).toBe("500 B");
    });

    it("formats kilobytes correctly", () => {
      expect(formatBytes(2048)).toBe("2.0 KB");
    });

    it("formats megabytes correctly", () => {
      expect(formatBytes(1500000)).toBe("1.4 MB");
    });

    it("formats gigabytes correctly", () => {
      expect(formatBytes(1500000000)).toBe("1.40 GB");
    });
  });
});
