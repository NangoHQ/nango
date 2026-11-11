import { SegmentedControl as DSSegmentedControl, SegmentedControlItem } from '@nangohq/design-system';

import type { LucideIcon } from 'lucide-react';

export interface SegmentedControlOption<T extends string> {
    value: T;
    label: string;
    Icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: SegmentedControlOption<T>[];
    'aria-label': string;
    /** `sm` (28px) by default, the height this control had before the design-system version. */
    size?: 'md' | 'sm';
}

/** Typed options-array wrapper around the design-system `SegmentedControl`. */
export function SegmentedControl<T extends string>({ value, onChange, options, 'aria-label': ariaLabel, size = 'sm' }: SegmentedControlProps<T>) {
    return (
        <DSSegmentedControl size={size} aria-label={ariaLabel} value={value} onValueChange={(next) => onChange(next as T)}>
            {options.map(({ value: optionValue, label, Icon }) => (
                <SegmentedControlItem key={optionValue} value={optionValue} icon={Icon ? <Icon /> : undefined}>
                    {label}
                </SegmentedControlItem>
            ))}
        </DSSegmentedControl>
    );
}
