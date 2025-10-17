import * as TabsPrimitive from '@radix-ui/react-tabs';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { cn } from '@/utils/utils';

export const NavigationList: React.FC<React.ComponentProps<typeof TabsPrimitive.List>> = (props) => {
    return <TabsPrimitive.List className="w-46 h-fit shrink-0" {...props} />;
};

export const NavigationTrigger: React.FC<React.ComponentProps<typeof TabsPrimitive.Trigger>> = (props) => {
    return (
        <TabsPrimitive.Trigger
            className="w-full p-2.5 cursor-pointer text-text-secondary text-sm font-medium text-start rounded hover:bg-bg-elevated data-[state=active]:bg-bg-subtle data-[state=active]:text-text-primary"
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
