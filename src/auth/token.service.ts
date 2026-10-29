import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { AppConfig } from '../config/app-config.js';
import type { AccessTokenClaims, AuthenticatedUser } from './auth.types.js';

const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.enum(['candidate', 'analyst', 'admin']),
});

/**
 * Emisión y verificación de tokens de acceso (HS256).
 * Si se adopta Firebase Auth (decisión D6), solo cambia verify().
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async sign(claims: AccessTokenClaims, expiresIn: `${number}${'m' | 'h' | 'd'}` = '1h') {
    return this.jwt.signAsync(claims, {
      secret: this.config.env.JWT_SECRET,
      algorithm: 'HS256',
      issuer: this.config.env.JWT_ISSUER,
      audience: this.config.env.JWT_AUDIENCE,
      expiresIn,
    });
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    const payload = await this.jwt.verifyAsync<object>(token, {
      secret: this.config.env.JWT_SECRET,
      algorithms: ['HS256'],
      issuer: this.config.env.JWT_ISSUER,
      audience: this.config.env.JWT_AUDIENCE,
    });
    const claims = claimsSchema.parse(payload);
    return { userId: claims.sub, role: claims.role };
  }
}
