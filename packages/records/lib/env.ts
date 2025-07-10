import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENVS, parseEnvs } from '@nangohq/utils';

export const envs = parseEnvs(ENVS);

export const filename = fileURLToPath(import.meta.url);
export const dirname = path.dirname(path.join(filename, '../../'));
