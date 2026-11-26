import { isSameMinute, parse } from 'date-fns';

export interface Period {
    from: Date;
    to?: Date;
}

export interface PeriodPreset {
    name: string;
    label: string;
    shortLabel: string;
    toPeriod: () => Period | null; // null = everything
}

export function parsePeriod(input: string, dateTimeFormat: string, example: string): { period: Period | null; error: string | null } {
    // Validate input format
    const dateFormatRegex = /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2} - [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2}$/;
    if (!dateFormatRegex.test(input)) {
        return { period: null, error: `Invalid format. Example: ${example}` };
    }

    const [from, to] = input.split('-').map((d) => d.trim());

    const period = {
        from: parse(from, dateTimeFormat, new Date()),
        to: parse(to, dateTimeFormat, new Date())
    };

    if (isNaN(period.from.getTime()) || isNaN(period.to.getTime())) {
        return { period: null, error: `Invalid date. Example: ${example}` };
    }

    if (period.from.getTime() >= period.to.getTime()) {
        return { period: null, error: "'from' date must be before 'to' date" };
    }

    return { period: period, error: null };
}

export function matchPresetFromPeriod(period: Period | null, presets: PeriodPreset[]): PeriodPreset | null {
    return (
        presets.find((preset) => {
            const presetPeriod = preset.toPeriod();

            if (!presetPeriod && !period) {
                return true;
            }

            if (!presetPeriod || !period) {
                return false;
            }

            return isSameMinute(period.from, presetPeriod.from) && isSameMinute(period.to ?? new Date(), presetPeriod.to ?? new Date());
        }) ?? null
    );
}

export function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${weeks}w ago`;
    return `${months}mo ago`;
}
