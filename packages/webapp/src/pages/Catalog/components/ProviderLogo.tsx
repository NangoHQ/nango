import { Zap } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';

import type { ApiProviderListItem } from '@nangohq/types';

export const ProviderLogo = ({ provider, className }: { provider: ApiProviderListItem; className: string }) => {
    return (
        <div className="relative shrink-0">
            <IntegrationLogo provider={provider.name} className={className} />
            {provider.preConfigured && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="absolute -top-1.5 -left-1.5 flex text-icon-brand">
                            <Zap className="size-4 fill-current" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">{provider.authMode === 'APP' ? 'Nango-managed app' : 'Nango-managed OAuth app'}</TooltipContent>
                </Tooltip>
            )}
        </div>
    );
};
