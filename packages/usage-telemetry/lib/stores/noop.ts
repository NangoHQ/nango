import { Ok } from '@nangohq/utils';

import type { UsageTelemetryWriter } from '../store.js';
import type { Result } from '@nangohq/utils';

/** Used when no database is configured: writes are dropped. */
export class NoopUsageStore implements UsageTelemetryWriter {
    record(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }
}
