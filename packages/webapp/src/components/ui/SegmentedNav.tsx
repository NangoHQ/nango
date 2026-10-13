import * as TabsPrimitive from '@radix-ui/react-tabs';

import type { LucideIcon } from 'lucide-react';

export interface SegmentedTabOption<T extends string> {
    value: T;
    label: string;
    Icon?: LucideIcon;
}

interface SegmentedTabsProps<T extends string> {
    value: T;
    onValueChange: (value: T) => void;
    options: SegmentedTabOption<T>[];
    'aria-label': string;
}

export function SegmentedTabs<T extends string>({ value, onValueChange, options, 'aria-label': ariaLabel }: SegmentedTabsProps<T>) {
    return (
        <TabsPrimitive.Root value={value} onValueChange={(next) => onValueChange(next as T)} activationMode="manual">
            <TabsPrimitive.List
                aria-label={ariaLabel}
                className="inline-flex h-8 items-center gap-0.5 rounded-ds-md border border-border-default bg-surface-canvas p-0.5"
            >
                {options.map(({ value: optionValue, label, Icon }) => (
                    <TabsPrimitive.Trigger
                        key={optionValue}
                        value={optionValue}
                        className="inline-flex h-full cursor-pointer items-center gap-1.5 rounded-ds-sm border border-transparent px-2.5 text-body-medium-medium text-text-secondary transition-colors hover:text-text-strong focus-default data-[state=active]:border-border-default data-[state=active]:bg-surface-panel data-[state=active]:text-text-strong data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.04)] [&_svg]:size-4 [&_svg]:shrink-0"
                    >
                        {Icon && <Icon />}
                        {label}
                    </TabsPrimitive.Trigger>
                ))}
            </TabsPrimitive.List>
        </TabsPrimitive.Root>
    );
}
