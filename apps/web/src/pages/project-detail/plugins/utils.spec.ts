import { describe, it, expect } from "vitest";
import { parseScanPlugins, customPluginRepoHref } from "./utils";
import { PluginScan } from "./types";

describe("plugins/utils", () => {
  describe("parseScanPlugins", () => {
    it("returns empty arrays if scan is undefined", () => {
      expect(parseScanPlugins(undefined)).toEqual({
        isBedrock: false,
        plugins: [],
        muPlugins: [],
      });
    });

    it("parses array format plugins", () => {
      const scan: PluginScan = {
        id: 1,
        scanned_at: "2026-06-08",
        plugins: [
          { slug: "akismet", name: "Akismet", version: "5.0", latest_version: null, update_available: false, author: null, plugin_uri: null, description: null, managed_by_composer: false, composer_constraint: null },
        ],
      };
      const result = parseScanPlugins(scan);
      expect(result.isBedrock).toBe(false);
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].slug).toBe("akismet");
    });

    it("parses new structured format plugins", () => {
      const scan: PluginScan = {
        id: 2,
        scanned_at: "2026-06-08",
        plugins: {
          is_bedrock: true,
          plugins: [
            { slug: "akismet", name: "Akismet", version: "5.0", latest_version: null, update_available: false, author: null, plugin_uri: null, description: null, managed_by_composer: true, composer_constraint: null, is_mu_plugin: false },
            { slug: "wp-secure-guard", name: "WP Secure Guard", version: "1.0", latest_version: null, update_available: false, author: null, plugin_uri: null, description: null, managed_by_composer: false, composer_constraint: null, is_mu_plugin: true },
          ],
        },
      };
      const result = parseScanPlugins(scan);
      expect(result.isBedrock).toBe(true);
      expect(result.plugins).toHaveLength(1);
      expect(result.plugins[0].slug).toBe("akismet");
      expect(result.muPlugins).toHaveLength(1);
      expect(result.muPlugins[0].slug).toBe("wp-secure-guard");
    });
  });

  describe("customPluginRepoHref", () => {
    it("formats SSH URLs correctly", () => {
      expect(customPluginRepoHref("git@github.com:user/repo.git")).toBe("https://github.com/user/repo");
    });

    it("formats HTTPS URLs correctly", () => {
      expect(customPluginRepoHref("https://github.com/user/repo.git")).toBe("https://github.com/user/repo");
    });
  });
});
