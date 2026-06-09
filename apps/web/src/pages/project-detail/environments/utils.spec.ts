import { describe, it, expect } from "vitest";
import { parseProtectedPostTypes, envSchema } from "./utils";

describe("environments/utils", () => {
  describe("parseProtectedPostTypes", () => {
    it("handles empty input", () => {
      expect(parseProtectedPostTypes("")).toEqual([]);
    });

    it("parses comma-separated tags, trims, and deduplicates", () => {
      expect(parseProtectedPostTypes("post, page, post, custom_type")).toEqual([
        "post",
        "page",
        "custom_type",
      ]);
    });

    it("filters out invalid slug characters", () => {
      expect(parseProtectedPostTypes("post, invalid type!, page")).toEqual([
        "post",
        "page",
      ]);
    });
  });

  describe("envSchema", () => {
    it("validates correct environment payload", () => {
      const data = {
        type: "production",
        server_id: 1,
        url: "https://example.com",
        root_path: "/var/www/html",
      };
      const parsed = envSchema.safeParse(data);
      expect(parsed.success).toBe(true);
    });

    it("fails on invalid URL", () => {
      const data = {
        type: "production",
        server_id: 1,
        url: "invalid-url",
        root_path: "/var/www/html",
      };
      const parsed = envSchema.safeParse(data);
      expect(parsed.success).toBe(false);
    });
  });
});
