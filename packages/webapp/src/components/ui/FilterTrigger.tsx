import { ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';

import { Button } from '@nangohq/design-system';

import { CountBadge } from './CountBadge';

import type { ButtonProps } from '@nangohq/design-system';

export interface FilterTriggerProps extends Omit<ButtonProps, 'children' | 'variant' | 'size' | 'asChild'> {
    label: string;
    selectedLabel?: string | null;
    count: number;
}

export const FilterTrigger = forwardRef<HTMLButtonElement, FilterTriggerProps>(({ label, selectedLabel, count, ...props }, ref) => (
    <Button ref={ref} variant="outline-filled" size="sm" {...props}>
        <span>{label}</span>
        {count === 1 && selectedLabel && (
            <>
                <span aria-hidden className="h-3 w-px bg-border-default" />
                <span className="max-w-40 truncate">{selectedLabel}</span>
            </>
        )}
        {count > 1 && <CountBadge count={count} />}
        <ChevronDown className="size-3 text-icon-secondary" />
    </Button>
));
FilterTrigger.displayName = 'FilterTrigger';
