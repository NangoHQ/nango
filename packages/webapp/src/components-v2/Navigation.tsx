import * as TabsPrimitive from '@radix-ui/react-tabs';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { cn } from '@/utils/utils';

export const NavigationList: React.FC<React.ComponentProps<typeof TabsPrimitive.List>> = (props) => {
    return (
        <TabsPrimitive.List
            className={cn(
                'w-46 h-fit shrink-0 p-2 bg-bg-elevated rounded',
                // Horizontal
                'data-[orientation=horizontal]:w-fit data-[orientation=horizontal]:h-10 data-[orientation=horizontal]:p-1'
            )}
            {...props}
        />
    );
};

export const NavigationTrigger: React.FC<React.ComponentProps<typeof TabsPrimitive.Trigger>> = (props) => {
    return (
        <TabsPrimitive.Trigger
            className={cn(
                'w-full p-2.5 cursor-pointer text-text-tertiary !text-body-medium-medium text-start rounded transition-colors hover:bg-bg-surface hover:text-text-primary data-[state=active]:bg-bg-subtle data-[state=active]:text-text-primary focus-default',
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

export const Navigation: React.FC<React.ComponentProps<typeof TabsPrimitive.Root> & { onTabChanged?: (value: string) => void }> = ({
    defaultValue,
    className,
    onTabChanged,
    ...rest
}) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<string>(defaultValue || '');

    useEffect(() => {
        if (location.hash) {
            setActiveTab(location.hash.slice(1));
        }
    }, [location.hash]);

    function handleValueChange(value: string) {
        setActiveTab(value);
        navigate(`#${value}`, { replace: true });
        onTabChanged?.(value);
    }

    return (
        <TabsPrimitive.Root
            value={activeTab}
            onValueChange={handleValueChange}
            orientation="vertical"
            {...rest}
            className={cn('flex gap-11 w-full data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:gap-5', className)}
        />
    );
};
