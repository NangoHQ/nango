import { format, isSameDay } from 'date-fns';

import { millisecondsToRuntime } from '../../utils/utils';
import { typesOptions } from './constants';

import type { OperationRow } from '@nangohq/types';

const typeLabels: Record<string, string> = { action: 'Tool', ...Object.fromEntries(typesOptions.map((opt) => [opt.value, opt.label])) };

export function operationTypeLabel(operation: Pick<OperationRow, 'operation'>): { type: string; action: string } {
    const { type, action } = operation.operation;
    return { type: typeLabels[type] ?? type, action: action.replaceAll('_', ' ') };
}

export function formatOperationTime(createdAt: string, now: Date): string {
    const date = new Date(createdAt);
    return format(date, isSameDay(date, now) ? 'HH:mm:ss' : 'MMM d HH:mm:ss');
}

export function formatElapsed(ms: number): string {
    const clamped = Math.max(0, ms);
    return clamped < 60_000 ? `${Math.floor(clamped / 1000)}s` : millisecondsToRuntime(clamped - (clamped % 1000));
}

export function formatDuration(rawMs: number): string {
    const ms = Math.max(0, rawMs);
    if (ms < 1000) {
        return `${Math.round(ms)}ms`;
    }
    if (ms < 60_000) {
        return `${(Math.floor(ms / 100) / 10).toFixed(1)}s`;
    }
    return millisecondsToRuntime(ms - (ms % 1000));
}
