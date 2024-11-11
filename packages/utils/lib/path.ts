import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
export const projectRoot = path.join(__filename, '../../../..');
