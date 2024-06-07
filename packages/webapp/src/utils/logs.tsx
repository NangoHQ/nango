import type { SearchOperations } from '@nangohq/types';
import { addMilliseconds } from 'date-fns';

export function getLogsUrl(
    options: Omit<
        Partial<{
            [P in keyof SearchOperations['Body']]?: string | undefined;
        }>,
        'period'
    > & { operationId?: string | null | number; env: string; day?: Date }
): string {
    const usp = new URLSearchParams();
    for (const [key, val] of Object.entries(options)) {
        if (!val || key === 'env') {
            continue;
        }
        if (key === 'day') {
            const from = new Date();
            from.setHours(0, 0);
            const to = new Date();
            to.setHours(23, 59);
            usp.set('from', from.toISOString());
            usp.set('to', to.toISOString());
            continue;
        }
        usp.set(key, val as any);
    }

    usp.set('live', 'false');
    usp.sort();
    return `/${options.env}/logs?${usp.toString()}`;
}

export function slidePeriod(period: Exclude<SearchOperations['Body']['period'], undefined>) {
    const now = new Date();
    let from = new Date(period.from);
    let to = new Date(period.to);
    const sliding = now.getTime() - to.getTime();
    to = addMilliseconds(to, sliding);
    from = addMilliseconds(from, sliding);

    return { from: from.toISOString(), to: to.toISOString() };
}
