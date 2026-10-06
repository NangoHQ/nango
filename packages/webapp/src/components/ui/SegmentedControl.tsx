import { cn } from '@/utils/utils';

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
}

export function SegmentedControl<T extends string>({ value, onChange, options, 'aria-label': ariaLabel }: SegmentedControlProps<T>) {
    return (
        <div role="group" aria-label={ariaLabel} className="flex items-center h-7 rounded-[2px] border-[0.5px] border-border-input text-body-small-regular">
            {options.map(({ value: optionValue, label, Icon }, i) => (
                <button
                    key={optionValue}
                    type="button"
                    aria-pressed={value === optionValue}
                    onClick={() => onChange(optionValue)}
                    className={cn(
                        'flex items-center gap-1 px-2.5 h-full transition-colors focus-visible:outline-none focus-visible:shadow-focus-outline-default focus-visible:relative focus-visible:z-10',
                        i === 0 ? 'rounded-l-[1.5px]' : 'border-l-[0.5px] border-border-input',
                        i === options.length - 1 && 'rounded-r-[1.5px]',
                        value === optionValue ? 'bg-surface-panel-inset text-text-strong' : 'text-text-secondary hover:text-text-strong'
                    )}
                >
                    {Icon && <Icon className="size-3.5" />}
                    {label}
                </button>
            ))}
        </div>
    );
}
