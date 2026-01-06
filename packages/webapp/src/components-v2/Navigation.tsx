import * as TabsPrimitive from '@radix-ui/react-tabs';
import React, { useState } from 'react';

import { cn } from '@/utils/utils';

export const NavigationList: React.FC<React.ComponentProps<typeof TabsPrimitive.List>> = (props) => {
    return (
        <TabsPrimitive.List
            {...props}
            className={cn(
                'w-46 h-fit shrink-0 p-2 bg-bg-elevated rounded',
                // Horizontal
                'data-[orientation=horizontal]:w-fit data-[orientation=horizontal]:h-10 data-[orientation=horizontal]:p-1',
                props.className
            )}
        />
    );
};

export const NavigationTrigger: React.FC<React.ComponentProps<typeof TabsPrimitive.Trigger>> = (props) => {
    return (
        <TabsPrimitive.Trigger
            className={cn(
                'w-full p-2.5 cursor-pointer text-text-secondary !text-body-medium-medium text-start rounded transition-colors hover:bg-bg-surface hover:text-text-primary data-[state=active]:bg-bg-subtle data-[state=active]:text-text-primary focus-default',
                // Horizontal
                'data-[orientation=horizontal]:w-fit data-[orientation=horizontal]:h-full data-[orientation=horizontal]:px-3 data-[orientation=horizontal]:py-0.5'
            )}
            {...props}
        />
    );
};

export const NavigationContent: React.FC<React.ComponentProps<typeof TabsPrimitive.Content>> = (props) => {
    return <TabsPrimitive.Content {...props} className={cn('focus:outline-none', props.className)} />;
};

export interface NavigationProps extends Omit<React.ComponentProps<typeof TabsPrimitive.Root>, 'value' | 'onValueChange'> {
    /**
     * The controlled value of the active tab. When provided, Navigation is controlled.
     * When not provided, Navigation manages its own state internally (uncontrolled).
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

export const Navigation: React.FC<NavigationProps> = ({ value, onValueChange, defaultValue, className, ...rest }) => {
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
            orientation="vertical"
            {...rest}
            className={cn('flex gap-11 w-full data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:gap-5', className)}
        />
    );
};
