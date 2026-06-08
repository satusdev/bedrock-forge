import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

interface JwtPayload {
  sub: number;
  email: string;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("jwt.secret")!,
    });
  }

  validate(payload: JwtPayload) {
    // The JWT signature and expiry are already verified by passport-jwt before
    // this method is called. A DB round-trip on every request would add one
    // query per authenticated call with no security benefit (a deleted user's
    // access token expires within 15 min anyway). Trust the signed payload.
    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
