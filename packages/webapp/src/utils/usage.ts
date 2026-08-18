import type { UsageMetric } from '@nangohq/types';

const numberFormatter = Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Formats multiples of 1000 to K, M, B, or T.
 * @example 1000 -> 1K
 * @example 2000 -> 2K
 * @example 2025 -> 2,025
 * @example 1000000 -> 1M
 * @example 1234000 -> 1,234K
 */
export function formatLimit(limit: number) {
    if (limit >= 1_000_000_000_000 && limit % 1_000_000_000_000 === 0) {
        return `${numberFormatter.format(limit / 1_000_000_000_000)}T`;
    }
    if (limit >= 1_000_000_000 && limit % 1_000_000_000 === 0) {
        return `${numberFormatter.format(limit / 1_000_000_000)}B`;
    }
    if (limit >= 1_000_000 && limit % 1_000_000 === 0) {
        return `${numberFormatter.format(limit / 1_000_000)}M`;
    }
    if (limit >= 1000 && limit % 1000 === 0) {
        return `${numberFormatter.format(limit / 1000)}K`;
    }
    return numberFormatter.format(limit);
}

// Below this, usage is shown in full. Production connection counts sit under 1,000 for 99.6% of
// accounts, so abbreviating small figures would blur the numbers most customers actually look at.
const USAGE_COMPACT_FROM = 10_000;

// 3 significant digits, so an abbreviated figure never loses more than ~0.5% — the previous
// divide-then-round approach dropped to a single significant digit just above each threshold
// (1,022,107 rendered as "1M", 9,943 as "9K"). Lowercase `k` per the design; Intl gives "K".
const compactFormatter = Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 });

/**
 * A usage figure. These are billed quantities, so the format never rounds away a digit that changes
 * what someone owes — anything under {@link USAGE_COMPACT_FROM} is exact, and above it keeps 3
 * significant digits. Pair with {@link formatUsageExact} to offer the full number on hover.
 *
 * @example 46 -> 46
 * @example 9943 -> 9,943
 * @example 1022107 -> 1.02M
 */
export function formatUsage(usage: number) {
    if (usage < USAGE_COMPACT_FROM) {
        return numberFormatter.format(usage);
    }
    return compactFormatter.format(usage).replace('K', 'k');
}

/** The unabbreviated figure, so an abbreviated cell can still be reconciled against an invoice. */
export function formatUsageExact(usage: number) {
    return numberFormatter.format(usage);
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const oneDecimalFormatter = Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/**
 * A duration held in milliseconds, shown in the unit the pricing page uses for the allowance
 * included in each plan (hours). Sub-hour values step down to minutes and seconds rather than
 * rendering as "0h": in production a quarter of accounts use under 6 minutes of compute in a month
 * and the smallest is a single second, while the largest exceeds 300,000 hours.
 *
 * @example 45000 -> 45s
 * @example 3240000 -> 54m
 * @example 5055834 -> 1.4h
 * @example 1140286209245 -> 316,746h
 */
export function formatDurationMs(ms: number): string {
    if (ms <= 0) {
        return '0h';
    }
    if (ms < MS_PER_SECOND) {
        return '<1s';
    }
    if (ms < MS_PER_MINUTE) {
        return `${Math.round(ms / MS_PER_SECOND)}s`;
    }
    if (ms < MS_PER_HOUR) {
        return `${Math.round(ms / MS_PER_MINUTE)}m`;
    }
    const hours = ms / MS_PER_HOUR;
    // A tenth of an hour is 6 minutes, which is meaningful at single-digit hours and noise past 100.
    return `${hours < 100 ? oneDecimalFormatter.format(hours) : numberFormatter.format(hours)}h`;
}

/**
 * Metrics whose value is a duration in milliseconds rather than a count. `function_compute_gbms` is
 * a misnomer kept for back-compat — the billable quantity behind it is `SUM(duration_ms)`, matching
 * Orb's "Function compute time" (see `clickhouse.query.ts`).
 */
function isDurationMetric(metric: UsageMetric): boolean {
    return metric === 'function_compute_gbms';
}

/** {@link formatUsage} or {@link formatDurationMs}, depending on what the metric measures. */
export function formatMetricUsage(metric: UsageMetric, usage: number): string {
    return isDurationMetric(metric) ? formatDurationMs(usage) : formatUsage(usage);
}

/** {@link formatLimit} or {@link formatDurationMs}, depending on what the metric measures. */
export function formatMetricLimit(metric: UsageMetric, limit: number): string {
    return isDurationMetric(metric) ? formatDurationMs(limit) : formatLimit(limit);
}

/** The unabbreviated figure for a metric, for the title on an abbreviated cell. */
export function formatMetricExact(metric: UsageMetric, usage: number): string {
    if (!isDurationMetric(metric)) {
        return formatUsageExact(usage);
    }
    return `${oneDecimalFormatter.format(usage / MS_PER_HOUR)} hours`;
}

/** Usage against a plan cap. `uncapped` = no limit; `near` starts at 70%; `over` at 100%. */
export type UsageState = 'uncapped' | 'ok' | 'near' | 'over';

/** Threshold at which a metric is considered "near" its limit (warning state), per the design. */
export const NEAR_LIMIT_RATIO = 0.7;

export function getUsageState(usage: number, limit: number | null): UsageState {
    if (!limit) {
        return 'uncapped';
    }
    if (usage >= limit) {
        return 'over';
    }
    if (usage >= limit * NEAR_LIMIT_RATIO) {
        return 'near';
    }
    return 'ok';
}

/**
 * Roll up a set of metrics to the single most-severe usage state, for a summary indicator like the
 * sidebar alert. Capped metrics only — `uncapped` metrics (no limit) are ignored. Returns `over` if
 * any metric is at/over its cap, else `near` if any is nearing, else `ok` (including when empty).
 */
export function getAggregateUsageState(metrics: Record<string, { usage: number; limit: number | null }>): UsageState {
    let hasNear = false;
    for (const { usage, limit } of Object.values(metrics)) {
        const state = getUsageState(usage, limit);
        if (state === 'over') {
            return 'over';
        }
        if (state === 'near') {
            hasNear = true;
        }
    }
    return hasNear ? 'near' : 'ok';
}

/**
 * Track + fill classes for a usage progress bar, keyed on state (green ok / amber near / red over).
 * Fill is the solid `icon-*` colour; the track is the same colour at low opacity (matching the
 * design, where the track is the icon colour under an ~80% surface overlay).
 */
export function getUsageBarStyles(state: UsageState): { track: string; fill: string } {
    switch (state) {
        case 'over':
            return { track: 'bg-icon-danger/20', fill: 'bg-icon-danger' };
        case 'near':
            return { track: 'bg-icon-warning/20', fill: 'bg-icon-warning' };
        default:
            return { track: 'bg-icon-success/20', fill: 'bg-icon-success' };
    }
}

/** Text colour for a usage figure keyed on state: muted when uncapped, red over, amber near, default ok. */
export function getUsageStateTextColor(state: UsageState): string {
    switch (state) {
        case 'over':
            return 'text-text-danger';
        case 'near':
            return 'text-text-warning';
        case 'uncapped':
            return 'text-text-muted';
        default:
            return 'text-text-default';
    }
}
