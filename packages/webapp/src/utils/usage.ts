const numberFormatter = Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Formats exact multiples of 1000 to k, M, B, or T — lowercase `k` per the design, matching the
 * abbreviation {@link formatUsage} produces so a used/limit pair doesn't mix "184k / 100K".
 * @example 1000 -> 1k
 * @example 2000 -> 2k
 * @example 2025 -> 2,025
 * @example 1000000 -> 1M
 * @example 1234000 -> 1,234k
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
        return `${numberFormatter.format(limit / 1000)}k`;
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

// Records and connections are billed on a running average, so their totals arrive fractional.
const exactFormatter = Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * A usage figure. These are billed quantities, so the format never rounds away a digit that changes
 * what someone owes — anything under {@link USAGE_COMPACT_FROM} is exact, and above it keeps 3
 * significant digits. Pair with {@link formatUsageExact} to offer the full number on hover.
 *
 * @example 46 -> 46
 * @example 9.5 -> 9.5
 * @example 9943 -> 9,943
 * @example 1022107 -> 1.02M
 */
export function formatUsage(usage: number) {
    if (usage < USAGE_COMPACT_FROM) {
        return exactFormatter.format(usage);
    }
    return compactFormatter.format(usage).replace('K', 'k');
}

/** The unabbreviated figure, so an abbreviated cell can still be reconciled against an invoice. */
export function formatUsageExact(usage: number) {
    return exactFormatter.format(usage);
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
