import * as TabsPrimitive from '@radix-ui/react-tabs';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { cn } from '@/utils/utils';

export const TabsList: React.FC<React.ComponentProps<typeof TabsPrimitive.List>> = (props) => {
    return <TabsPrimitive.List className="w-full inline-flex gap-5 border-b border-b-border-default" {...props} />;
};

export const TabsTrigger: React.FC<React.ComponentProps<typeof TabsPrimitive.Trigger>> = (props) => {
    return (
        <TabsPrimitive.Trigger
            className="w-fit px-3 py-2 inline-flex items-center gap-1.5 cursor-pointer text-text-secondary text-body-medium-medium border-b-2 border-b-transparent transition-colors hover:text-text-primary hover:border-text-tertiary data-[state=active]:text-text-primary data-[state=active]:border-text-primary focus-default"
            {...props}
        />
    );
};

export const TabsContent: React.FC<React.ComponentProps<typeof TabsPrimitive.Content>> = (props) => {
    return <TabsPrimitive.Content {...props} className={cn('focus:outline-none', props.className)} />;
};

export const Tabs: React.FC<React.ComponentProps<typeof TabsPrimitive.Root> & { basePath: string }> = ({ defaultValue, className, basePath, ...rest }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<string>(defaultValue || '');

    useEffect(() => {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        const lastSegment = pathSegments[pathSegments.length - 1];
        const basePathSegments = basePath.split('/').filter(Boolean);
        const lastBasePathSegment = basePathSegments[basePathSegments.length - 1];
        if (lastSegment && lastSegment !== lastBasePathSegment) {
            setActiveTab(lastSegment);
        } else if (defaultValue) {
            handleValueChange(defaultValue);
        }
    }, [location.pathname, basePath]);

    function handleValueChange(value: string) {
        setActiveTab(value);
        navigate(`${basePath}/${value}`, { replace: true });
    }

    return (
        <TabsPrimitive.Root
            value={activeTab}
            onValueChange={handleValueChange}
            orientation="horizontal"
            {...rest}
            className={cn('flex flex-col gap-10 w-full', className)}
        />
    );
};
