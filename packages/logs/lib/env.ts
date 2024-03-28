import { initGlobalEnv } from '@nangohq/utils/dist/environment/helpers.js';
import { initLogsEnv } from './utils.js';

export const envs = { ...initGlobalEnv(), ...initLogsEnv() };
