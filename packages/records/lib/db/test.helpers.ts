import { db } from './client.js';
import { schema } from './config.js';

// WARNING: to use only in tests
export async function clearDb(): Promise<void> {
    await db.raw(`DROP SCHEMA ${schema} CASCADE`);
}
