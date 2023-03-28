import type { Cache } from '../models.js';
import db from '../db/database.js';

class CacheService {
    async set(key: string, value: Record<any, any>): Promise<string> {
        let cache = await this.findByKey(key);
        if (cache) {
            return this.findByKeyQueryBuilder(key).update({ key, value: JSON.stringify(value) }, ['key']);
        } else {
            return this.findByKeyQueryBuilder(key).insert({ key, value: JSON.stringify(value) }, ['key']);
        }
    }

    async get(key: string): Promise<Record<any, any> | null> {
        let cache = await this.findByKey(key);
        if (!cache) {
            return null;
        }

        return cache.value as unknown as Record<any, any>;
    }

    async delete(key: string) {
        let cache = await this.findByKey(key);
        if (!cache) {
            return;
        }
        await this.findByKeyQueryBuilder(key).delete();
    }

    findByKey(key: string) {
        return this.findByKeyQueryBuilder(key).first();
    }

    findByKeyQueryBuilder(key: string) {
        return db.knex.withSchema(db.schema()).select('*').from<Cache>('_nango_cache').where({ key });
    }
}

export default new CacheService();
