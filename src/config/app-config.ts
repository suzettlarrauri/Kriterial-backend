import { Global, Injectable, Module } from '@nestjs/common';
import { type Env, parseEnv } from './env.schema.js';

/** Configuración tipada e inmutable de la aplicación. */
@Injectable()
export class AppConfig {
  readonly env: Readonly<Env>;

  constructor(env: Env) {
    this.env = Object.freeze(env);
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}

@Global()
@Module({
  providers: [
    {
      provide: AppConfig,
      useFactory: () => new AppConfig(parseEnv(process.env)),
    },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}
