import { describe, expect, it } from 'vitest';

import { isValidUtcDay } from './date.js';
import { segmentASelectSql, segmentBSelectSql, verificationQueries } from './sql.js';
import { assertSafeClickhouseUrl } from './url.js';

describe('daily function executions v2 backfill SQL', () => {
    it('recomputes raw-event days with per-execution started seconds', () => {
        const sql = segmentBSelectSql('usage', '2026-08-18');

        expect(sql).toContain('FROM usage.raw_events FINAL');
        expect(sql).toContain("type = 'usage.function_executions' AND toDate(ts) = toDate('2026-08-18')");
        expect(sql).toContain('sum(toUInt64(ceil(coalesce(attributes.telemetryBag.durationMs::Nullable(UInt64), 0) / 1000.0))) AS duration_seconds');
        expect(sql).toContain('AS compute_gbs');
    });

    it('copies expired history from v1 with unrecoverable values set to zero', () => {
        const sql = segmentASelectSql('usage', '2026-05-18');

        expect(sql).toContain('FROM usage.daily_function_executions');
        expect(sql).toContain("WHERE day = toDate('2026-05-18')");
        expect(sql).toContain('toUInt64(0) AS duration_seconds');
        expect(sql).toContain('toFloat64(0) AS compute_gbs');
    });

    it('checks started-second bounds only for reconstructible raw-event history', () => {
        const sql = verificationQueries('usage', '2026-05-18');

        expect(sql).toContain("WHERE day >= toDate('2026-05-18')");
        expect(sql).toContain('duration_seconds < intDivOrZero(duration_ms + 999, 1000)');
    });
});

describe('ClickHouse target guard', () => {
    it('permits local ClickHouse without an override', () => {
        expect(() => assertSafeClickhouseUrl('http://localhost:8123', false)).not.toThrow();
    });

    it('requires an explicit override for remote ClickHouse', () => {
        expect(() => assertSafeClickhouseUrl('https://example.clickhouse.cloud', false)).toThrow('Pass --allow-remote');
        expect(() => assertSafeClickhouseUrl('https://example.clickhouse.cloud', true)).not.toThrow();
    });
});

describe('UTC day validation', () => {
    it('rejects calendar-invalid dates that JavaScript would normalize', () => {
        expect(isValidUtcDay('2024-02-29')).toBe(true);
        expect(isValidUtcDay('2024-02-30')).toBe(false);
        expect(isValidUtcDay('2023-02-29')).toBe(false);
    });
});
