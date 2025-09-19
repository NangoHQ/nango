import ms from 'ms';

import { Err, Ok } from './result.js';

import type { Result } from './result.js';
import type { StringValue } from 'ms';

export function getFrequencyMs(intervalStr: string): Result<number> {
    const runsMap = new Map([
        ['every half day', '12h'],
        ['every half hour', '30m'],
        ['every quarter hour', '15m'],
        ['every hour', '1h'],
        ['every day', '1d'],
        ['every month', '30d'],
        ['every week', '7d']
    ]);
    const interval = runsMap.get(intervalStr) || intervalStr.replace('every ', '');
    const intervalMs = ms((interval.trim() as StringValue) || 'not valid');
    if (isNaN(intervalMs)) {
        return Err('invalid_interval');
    }

    return Ok(intervalMs);
}
