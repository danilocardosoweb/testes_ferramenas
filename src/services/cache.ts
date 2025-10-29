import { openDB, DBSchema, IDBPDatabase } from "idb";

interface CarteiraDBSchema extends DBSchema {
  "carteira-cache": {
    key: string;
    value: {
      id: string;
      data: unknown;
      timestamp: number;
      fileHash: string;
    };
  };
}

const DB_NAME = "carteira-analysis-cache";
const STORE_NAME = "carteira-cache";
const DB_VERSION = 1;
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // sete dias

class CacheService {
  private dbPromise: Promise<IDBPDatabase<CarteiraDBSchema>>;

  constructor() {
    this.dbPromise = openDB<CarteiraDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }

  private async getRawEntry(key: string) {
    const db = await this.dbPromise;
    return db.get(STORE_NAME, key);
  }

  async getEntry<T>(key: string): Promise<{ data: T; fileHash: string } | null> {
    try {
      const result = await this.getRawEntry(key);
      if (!result) return null;

      if (result.timestamp < Date.now() - CACHE_TTL) {
        await this.clear(key);
        return null;
      }

      return { data: result.data as T, fileHash: result.fileHash };
    } catch (error) {
      console.error("Erro ao obter cache:", error);
      return null;
    }
  }

  async setEntry<T>(key: string, data: T, fileHash: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.put(STORE_NAME, {
        id: key,
        data,
        timestamp: Date.now(),
        fileHash,
      });
    } catch (error) {
      console.error("Erro ao gravar cache:", error);
    }
  }

  async clear(key: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.delete(STORE_NAME, key);
    } catch (error) {
      console.error("Erro ao limpar cache:", error);
    }
  }
}

export const cacheService = new CacheService();

export const buildUploadCacheKey = (uploadId: string, category: string = "carteira") => `${category}-${uploadId}`;

export const buildUploadVersion = (options: { checksum?: string | null; updatedAt: string; fileSize?: number | null }) => {
  if (options.checksum) return options.checksum;
  return `${options.updatedAt}-${options.fileSize ?? 0}`;
};
