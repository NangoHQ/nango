import { useRef, useState } from 'react';

import { EnvPill, Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { Breadcrumbs } from '@/components/patterns/Breadcrumbs';

export interface AppHeaderEnvironment {
    name: string;
    isProduction: boolean;
}

interface AppHeaderProps {
    actions?: React.ReactNode;
    breadcrumbIsHeading: boolean;
    breadcrumbLabel?: string;
    environment?: AppHeaderEnvironment;
    showEnv?: boolean;
}

const HeaderEnvPill: React.FC<{ environment: AppHeaderEnvironment }> = ({ environment }) => {
    const pillRef = useRef<HTMLSpanElement>(null);
    const [isTruncated, setIsTruncated] = useState(false);

    const onOpenChange = (open: boolean) => {
        const label = pillRef.current?.firstElementChild;
        if (open && label) {
            setIsTruncated(label.scrollWidth > label.clientWidth);
        }
    };

    return (
        <Tooltip onOpenChange={onOpenChange}>
            <TooltipTrigger asChild>
                <EnvPill ref={pillRef} env={environment.name} production={environment.isProduction} tabIndex={0} />
            </TooltipTrigger>
            <TooltipContent side="bottom">
                You are editing this environment
                {isTruncated && <span className="block break-all type-code-regular-xs">{environment.name}</span>}
            </TooltipContent>
        </Tooltip>
    );
};

export const AppHeader: React.FC<AppHeaderProps> = ({ actions, breadcrumbIsHeading, breadcrumbLabel, environment, showEnv = true }) => {
    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b-[0.5px] border-border-default bg-surface-canvas px-5">
            <div className="flex min-w-0 items-center gap-1.5">
                <Breadcrumbs currentIsHeading={breadcrumbIsHeading} currentLabel={breadcrumbLabel} />
                {showEnv && environment && <HeaderEnvPill environment={environment} />}
            </div>
            {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
};
