import type { Result } from '@nangohq/utils';
import { Err, Ok } from '@nangohq/utils';
import ms from 'ms';
import type { StringValue } from 'ms';
import { NangoError } from '../../utils/error.js';

export function getFrequencyMs(runs: string): Result<number> {
    const runsMap = new Map([
        ['every half day', '12h'],
        ['every half hour', '30m'],
        ['every quarter hour', '15m'],
        ['every hour', '1h'],
        ['every day', '1d'],
        ['every month', '30d'],
        ['every week', '7d']
    ]);
    const interval = runsMap.get(runs) || runs.replace('every ', '');

    const intervalMs = ms(interval as StringValue);
    if (!intervalMs) {
        const error = new NangoError('sync_interval_invalid');
        return Err(error);
    }

    if (intervalMs < ms('30s')) {
        const error = new NangoError('sync_interval_too_short');
        return Err(error);
    }

    return Ok(intervalMs);
}
