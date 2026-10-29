/**
 * Emite un token de acceso para desarrollo local. Crea el usuario si no existe.
 *   npm run dev:token -- <email> [candidate|analyst|admin]
 */
import { loadEnvFile } from '../src/config/load-env-file.js';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from '../src/config/app-config.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TokenService } from '../src/auth/token.service.js';

loadEnvFile();
if (process.env['NODE_ENV'] === 'production') throw new Error('dev-token no se usa en producción');

const [email = 'dev@kriterial.local', role = 'candidate'] = process.argv.slice(2);
if (!['candidate', 'analyst', 'admin'].includes(role)) throw new Error(`Rol inválido: ${role}`);


@Module({ imports: [AppConfigModule, PrismaModule, JwtModule.register({})], providers: [TokenService] })
class DevTokenModule {}

const app = await NestFactory.createApplicationContext(DevTokenModule, { logger: false });
try {
  const user = await app.get(PrismaService).user.upsert({
    where: { email },
    update: { role: role as 'candidate' },
    create: { email, role: role as 'candidate' },
  });
  console.log(await app.get(TokenService).sign({ sub: user.id, role: user.role }, '8h'));
} finally {
  await app.close();
}
