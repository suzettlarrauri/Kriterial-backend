/** Almacenamiento privado de objetos (audios). Las claves nunca son predecibles ni acceden fuera de la raíz. */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const STORAGE = Symbol('STORAGE');

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/._-]{0,255}$/;

export function assertSafeStorageKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.split('/').some((part) => part === '..' || part === '')) {
    throw new Error(`Clave de almacenamiento no válida: ${key}`);
  }
}
