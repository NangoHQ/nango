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
    const dateFormatRegex = /^[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2} - [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}$/;
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

    if (period.from > period.to) {
        return { period: null, error: "'from' date must be before 'to' date" };
    }

    return { period: period, error: null };
}

export function matchPresetFromPeriod(period: Period, presets: PeriodPreset[]): PeriodPreset | null {
    return (
        presets.find((preset) => {
            const presetPeriod = preset.toPeriod();

            if (!presetPeriod) {
                return false;
            }

            return isSameMinute(period.from, presetPeriod.from) && isSameMinute(period.to ?? new Date(), presetPeriod.to ?? new Date());
        }) ?? null
    );
}
