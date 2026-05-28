import { noopLogger } from '../config.js';

import type { StrictLogger } from '@nangohq/utils';

// Mutable module-level logger so daemons and models can call it without threading.
// Consumers override via Scheduler({ logger }) which calls setLogger().
export let logger: StrictLogger = noopLogger;

export function setLogger(next: StrictLogger): void {
    logger = next;
}
