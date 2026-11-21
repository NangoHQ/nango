import { Check } from 'lucide-react';

import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/utils/utils';

export type ChecklistRowState = 'pending' | 'current' | 'done';

const STATE_LABEL: Record<ChecklistRowState, string> = {
    pending: 'Not started',
    current: 'Waiting',
    done: 'Done'
};

/**
 * One item of a checklist that ticks itself off. `current` is the item being waited on.
 * Render inside a `<ul>`.
 */
export const ChecklistRow: React.FC<{ state: ChecklistRowState; label: React.ReactNode; trailing?: React.ReactNode }> = ({ state, label, trailing }) => {
    return (
        <li className="grid grid-cols-[16px_auto_1fr] items-center gap-2.5">
            <span aria-hidden className="grid size-4 place-items-center">
                {state === 'done' && (
                    <span className="grid size-4 place-items-center rounded-ds-full bg-status-success-icon text-text-on-accent">
                        <Check className="size-3" strokeWidth={3} />
                    </span>
                )}
                {state === 'current' && <Spinner className="size-3.5 text-icon-brand" />}
                {state === 'pending' && <span className="size-3.5 rounded-ds-full border-[1.5px] border-dashed border-border-strong" />}
            </span>
            <span
                className={cn(
                    'leading-5',
                    state === 'done' && 'type-text-medium-sm text-text-strong',
                    state === 'current' && 'type-text-regular-sm text-text-default',
                    state === 'pending' && 'type-text-regular-sm text-text-muted'
                )}
            >
                <span className="sr-only">{STATE_LABEL[state]}: </span>
                {label}
            </span>
            {trailing && <span className="flex h-5 items-center pl-0.5">{trailing}</span>}
        </li>
    );
};
