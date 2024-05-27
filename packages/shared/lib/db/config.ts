import { getDbConfig } from './getDbConfig.js';

const config = getDbConfig({ timeoutMs: 60000 });

export { config };
