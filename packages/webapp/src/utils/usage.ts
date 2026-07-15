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

export function formatUsage(usage: number) {
    if (usage >= 1_000_000_000_000) {
        return `${numberFormatter.format(usage / 1_000_000_000_000)}T`;
    }
    if (usage >= 1_000_000_000) {
        return `${numberFormatter.format(usage / 1_000_000_000)}B`;
    }
    if (usage >= 1_000_000) {
        return `${numberFormatter.format(usage / 1_000_000)}M`;
    }
    if (usage >= 1000) {
        return `${numberFormatter.format(usage / 1000)}K`;
    }
    return numberFormatter.format(usage);
}

/** Usage against a plan cap. `uncapped` = no limit; `near` starts at 80%; `over` at 100%. */
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
 * Badge styling for a usage number (sidebar `UsageCard`): neutral under the warning band,
 * warning at ≥80%, danger at ≥100%. Kept as a single function so the sidebar behaviour is
 * unchanged after the move out of `UsageCard.tsx`.
 */
export function getStylesForUsage(usage: number, limit: number | null) {
    switch (getUsageState(usage, limit)) {
        case 'over':
            return 'text-status-danger-text bg-status-danger-bg';
        case 'near':
            return 'text-status-warning-text bg-status-warning-bg';
        default:
            return 'text-text-strong bg-surface-panel-inset';
    }
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

/** Text colour for the "% of limit" / "Limit reached" label, keyed on state. */
export function getUsageStateTextColor(state: UsageState): string {
    switch (state) {
        case 'over':
            return 'text-text-danger';
        case 'near':
            return 'text-text-warning';
        default:
            return 'text-text-success';
    }
}
