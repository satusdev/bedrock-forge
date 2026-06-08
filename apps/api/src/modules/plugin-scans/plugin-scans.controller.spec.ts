/// <reference types="jest" />

import { PluginScansController } from "./plugin-scans.controller";

describe("PluginScansController", () => {
  it("accepts frontend search query parameter", () => {
    const svc = { searchWpOrg: jest.fn().mockReturnValue([]) };
    const controller = new PluginScansController(svc as any);

    controller.searchWpOrg("elementor", undefined);

    expect(svc.searchWpOrg).toHaveBeenCalledWith("elementor");
  });

  it("keeps backward-compatible q search parameter", () => {
    const svc = { searchWpOrg: jest.fn().mockReturnValue([]) };
    const controller = new PluginScansController(svc as any);

    controller.searchWpOrg(undefined, "contact-form");

    expect(svc.searchWpOrg).toHaveBeenCalledWith("contact-form");
  });

  it("accepts skipSafetyBackup from DELETE body", () => {
    const svc = { enqueuePluginManage: jest.fn().mockReturnValue({}) };
    const controller = new PluginScansController(svc as any);

    controller.removePlugin(3, "elementor", undefined, {
      skipSafetyBackup: true,
    });

    expect(svc.enqueuePluginManage).toHaveBeenCalledWith(
      3,
      "delete",
      "elementor",
      undefined,
      true,
    );
  });

  it("accepts legacy Axios-shaped skipSafetyBackup from DELETE body", () => {
    const svc = { enqueuePluginManage: jest.fn().mockReturnValue({}) };
    const controller = new PluginScansController(svc as any);

    controller.removePlugin(3, "elementor", undefined, {
      data: { skipSafetyBackup: true },
    });

    expect(svc.enqueuePluginManage).toHaveBeenCalledWith(
      3,
      "delete",
      "elementor",
      undefined,
      true,
    );
  });
});
