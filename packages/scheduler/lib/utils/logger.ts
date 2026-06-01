import { noopLogger } from '../config.js';

import type { StrictLogger } from '@nangohq/utils';

export let logger: StrictLogger = noopLogger;

export function setLogger(next: StrictLogger): void {
    logger = next;
}
