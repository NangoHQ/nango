import * as TabsPrimitive from '@radix-ui/react-tabs';
import React, { useState } from 'react';

import { cn } from '@/utils/utils';

export const TabsList: React.FC<React.ComponentProps<typeof TabsPrimitive.List>> = (props) => {
    return <TabsPrimitive.List {...props} className={cn('w-full inline-flex gap-5 border-b border-b-border-default', props.className)} />;
};

/**
 * Shared styling for tab triggers. Exported so non-tab controls that still need to sit in a
 * `TabsList` and look like a tab (e.g. an action button) can reuse it instead of copying the classes.
 */
export const tabsTriggerClassName =
    'w-fit px-3 py-2 inline-flex items-center gap-1.5 cursor-pointer text-text-secondary !text-body-medium-medium border-b-2 border-b-transparent transition-colors hover:text-text-strong hover:border-text-muted data-[state=active]:text-text-strong data-[state=active]:border-text-strong focus-default';

export const TabsTrigger: React.FC<React.ComponentProps<typeof TabsPrimitive.Trigger>> = (props) => {
    return <TabsPrimitive.Trigger {...props} className={cn(tabsTriggerClassName, props.className)} />;
};

export const TabsContent: React.FC<React.ComponentProps<typeof TabsPrimitive.Content>> = (props) => {
    return <TabsPrimitive.Content {...props} className={cn('focus:outline-none', props.className)} />;
};

export interface TabsProps extends Omit<React.ComponentProps<typeof TabsPrimitive.Root>, 'value' | 'onValueChange'> {
    /**
     * The controlled value of the active tab. When provided, Tabs is controlled.
     * When not provided, Tabs manages its own state internally (uncontrolled).
     */
    value?: string;
    /**
     * Callback when the value changes. Required when using controlled mode.
     */
    onValueChange?: (value: string) => void;
    /**
     * Default value for uncontrolled mode.
     */
    defaultValue?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onValueChange, defaultValue, className, ...rest }) => {
    const [internalValue, setInternalValue] = useState<string>(defaultValue || '');

    // Determine if we're in controlled mode
    const isControlled = value !== undefined;
    const activeValue = isControlled ? value : internalValue;

    const handleValueChange = (newValue: string) => {
        if (isControlled) {
            onValueChange?.(newValue);
        } else {
            setInternalValue(newValue);
        }
    };

    return (
        <TabsPrimitive.Root
            value={activeValue}
            onValueChange={handleValueChange}
            orientation="horizontal"
            {...rest}
            className={cn('flex flex-col gap-10 w-full', className)}
        />
    );
};
