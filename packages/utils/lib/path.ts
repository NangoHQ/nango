import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const projectRoot = path.join(__filename, '../../../..');
