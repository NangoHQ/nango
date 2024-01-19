import { getDbConfig } from './database.js';

const config = getDbConfig({ timeoutMs: 60000 });

export { config };
