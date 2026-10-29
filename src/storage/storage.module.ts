import { Global, Module } from '@nestjs/common';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AppConfig } from '../config/app-config.js';
import { assertSafeStorageKey, type StorageAdapter, STORAGE } from './storage.adapter.js';

/** Adaptador de desarrollo: disco local bajo STORAGE_DIR. En producción se sustituye por S3/R2 privado. */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, data, { flag: 'wx', mode: 0o600 });
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.pathOf(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    assertSafeStorageKey(key);
    return join(this.root, key);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [AppConfig],
      useFactory: (config: AppConfig): StorageAdapter => new LocalStorageAdapter(config.env.STORAGE_DIR),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
