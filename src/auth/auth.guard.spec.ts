import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppConfig } from '../config/app-config.js';
import { parseEnv } from '../config/env.schema.js';
import { IS_PUBLIC_KEY, ROLES_KEY } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import { TokenService } from './token.service.js';

const config = new AppConfig(
  parseEnv({
    DATABASE_URL: 'postgresql://u:p@localhost/db',
    REDIS_URL: 'redis://localhost',
    JWT_SECRET: 's'.repeat(40),
  }),
);
const tokens = new TokenService(new JwtService({}), config);
const userId = '7f6f0d1e-6a1c-4f63-9a0e-2d6f1b9e4c11';

function contextWith(authorization: string | undefined, meta: Record<string, unknown> = {}) {
  const request: Record<string, unknown> = { headers: { authorization } };
  const handler = () => undefined;
  for (const [k, v] of Object.entries(meta)) Reflect.defineMetadata(k, v, handler);
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { ctx, request };
}

describe('AuthGuard', () => {
  const guard = new AuthGuard(new Reflector(), tokens);

  it('deja pasar rutas @Public sin token', async () => {
    await expect(guard.canActivate(contextWith(undefined, { [IS_PUBLIC_KEY]: true }).ctx)).resolves.toBe(true);
  });

  it('rechaza peticiones sin token o con token inválido', async () => {
    await expect(guard.canActivate(contextWith(undefined).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(contextWith('Bearer basura').ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza tokens firmados con otro secreto', async () => {
    const other = new JwtService({ secret: 'o'.repeat(40) });
    const forged = await other.signAsync({ sub: userId, role: 'admin' }, { issuer: 'kriterial-api', audience: 'kriterial' });
    await expect(guard.canActivate(contextWith(`Bearer ${forged}`).ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('adjunta el usuario autenticado y aplica @Roles', async () => {
    const token = await tokens.sign({ sub: userId, role: 'candidate' });
    const ok = contextWith(`Bearer ${token}`);
    await expect(guard.canActivate(ok.ctx)).resolves.toBe(true);
    expect(ok.request['user']).toEqual({ userId, role: 'candidate' });

    const adminOnly = contextWith(`Bearer ${token}`, { [ROLES_KEY]: ['admin'] });
    await expect(guard.canActivate(adminOnly.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
