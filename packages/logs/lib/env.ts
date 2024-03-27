import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initLogsEnv, initGlobalEnv } from './utils.js';

export const envs = { ...initGlobalEnv(), ...initLogsEnv() };

export const isProd = envs.NODE_ENV === 'production';
export const isTest = envs.CI === 'true' || envs.VITEST === 'true';

export const filename = fileURLToPath(import.meta.url);
export const dirname = path.dirname(path.join(filename, '../../'));
