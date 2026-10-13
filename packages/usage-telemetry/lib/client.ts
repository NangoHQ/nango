import { Err } from '@nangohq/utils';

import type { UsageTelemetryWriter } from './store.js';
import type { UsagePoint } from './types.js';
import type { Result } from '@nangohq/utils';

export class UsageTelemetryClient {
    constructor(private readonly writer: UsageTelemetryWriter) {}

    async record(points: UsagePoint[]): Promise<Result<void>> {
        try {
            return await this.writer.record(points);
        } catch (err) {
            return Err(err);
        }
    }
}
