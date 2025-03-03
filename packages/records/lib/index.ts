import { db, dbRead } from './db/client.js';

export * from './db/migrate.js';
export * as records from './models/records.js';
export * as format from './helpers/format.js';
export type * from './types.js';
export { clearDb as clearDbTestsOnly } from './db/test.helpers.js';

export async function destroy() {
    await db.destroy();
    await dbRead.destroy();
}
