import * as TabsPrimitive from '@radix-ui/react-tabs';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { cn } from '@/utils/utils';

export const NavigationList: React.FC<React.ComponentProps<typeof TabsPrimitive.List>> = (props) => {
    return <TabsPrimitive.List className="w-[180px] h-fit shrink-0 p-3 rounded-md bg-bg-elevated border border-border-disabled" {...props} />;
};

export const NavigationTrigger: React.FC<React.ComponentProps<typeof TabsPrimitive.Trigger>> = (props) => {
    return (
        <TabsPrimitive.Trigger
            className="w-full px-2 py-2.5 cursor-pointer text-text-secondary text-sm text-start rounded border border-transparent hover:bg-bg-surface hover:border-border-disabled data-[state=active]:bg-bg-subtle data-[state=active]:text-text-primary data-[state=active]:border-border-disabled"
            {...props}
        />
    );
};

export const NavigationContent: React.FC<React.ComponentProps<typeof TabsPrimitive.Content>> = (props) => {
    return <TabsPrimitive.Content {...props} />;
};

export const Navigation: React.FC<React.ComponentProps<typeof TabsPrimitive.Root>> = ({ defaultValue, className, ...rest }) => {
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
    }

    return (
        <TabsPrimitive.Root
            value={activeTab}
            onValueChange={handleValueChange}
            orientation="vertical"
            {...rest}
            className={cn('flex gap-11 w-full', className)}
        />
    );
};
