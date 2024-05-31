import { getDbConfig } from './getConfig.js';

const config = getDbConfig({ timeoutMs: 60000 });

export { config };
