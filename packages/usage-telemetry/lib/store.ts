import type { UsagePoint } from './types.js';
import type { Result } from '@nangohq/utils';

export interface UsageTelemetryWriter {
    record(points: UsagePoint[]): Promise<Result<void>>;
}
