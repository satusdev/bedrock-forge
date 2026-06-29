import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthRepository } from "./auth.repository";

interface JwtPayload {
  sub: number;
  email: string;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly authRepo: AuthRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("jwt.secret")!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authRepo.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found or disabled");
    }

    const roleNames = user.user_roles.map((ur) => ur.role.name);

    return {
      id: Number(user.id),
      email: user.email,
      roles: roleNames,
    };
  }
}
