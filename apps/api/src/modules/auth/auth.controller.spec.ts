import { UnauthorizedException } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

const tokenPair = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: { id: 1, email: "admin@example.com", name: "Admin", roles: ["admin"] },
};

const makeAuthService = () =>
  ({
    login: jest.fn().mockResolvedValue(tokenPair),
    refresh: jest.fn().mockResolvedValue(tokenPair),
    logout: jest.fn().mockResolvedValue(undefined),
    refreshExpiresMs: jest.fn().mockReturnValue(30 * 24 * 60 * 60 * 1000),
  }) as unknown as jest.Mocked<AuthService>;

const makeResponse = () =>
  ({
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  }) as any;

describe("AuthController", () => {
  let service: jest.Mocked<AuthService>;
  let controller: AuthController;

  beforeEach(() => {
    service = makeAuthService();
    controller = new AuthController(service);
  });

  it("sets an httpOnly refresh cookie on login and omits it from the body", async () => {
    const req = { headers: { "user-agent": "jest" }, ip: "127.0.0.1" } as any;
    const res = makeResponse();

    const body = await controller.login(
      { email: "admin@example.com", password: "secret" },
      req,
      res,
    );

    expect(body).toEqual({
      accessToken: tokenPair.accessToken,
      user: tokenPair.user,
    });
    expect(res.cookie).toHaveBeenCalledWith(
      "bf_refresh",
      tokenPair.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/api/auth",
      }),
    );
  });

  it("refreshes from the cookie and rotates the cookie", async () => {
    const req = {
      headers: { cookie: "other=value; bf_refresh=old-refresh-token" },
      ip: "127.0.0.1",
    } as any;
    const res = makeResponse();

    const body = await controller.refresh(req, res);

    expect(service.refresh).toHaveBeenCalledWith(
      "old-refresh-token",
      undefined,
      "127.0.0.1",
    );
    expect(body).toEqual({
      accessToken: tokenPair.accessToken,
      user: tokenPair.user,
    });
    expect(res.cookie).toHaveBeenCalledWith(
      "bf_refresh",
      tokenPair.refreshToken,
      expect.any(Object),
    );
  });

  it("rejects refresh without a cookie", async () => {
    const req = { headers: {}, ip: "127.0.0.1" } as any;
    const res = makeResponse();

    await expect(controller.refresh(req, res)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it("revokes the cookie token and clears the cookie on logout", async () => {
    const req = { headers: { cookie: "bf_refresh=old-refresh-token" } } as any;
    const res = makeResponse();

    await controller.logout(req, res);

    expect(service.logout).toHaveBeenCalledWith("old-refresh-token");
    expect(res.clearCookie).toHaveBeenCalledWith(
      "bf_refresh",
      expect.objectContaining({ path: "/api/auth" }),
    );
  });
});
