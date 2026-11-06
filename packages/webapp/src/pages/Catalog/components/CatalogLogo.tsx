import { Check } from 'lucide-react';
import { useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { cn } from '@/utils/utils';
import { getInitials } from '../catalog.utils';

interface CatalogLogoProps {
    provider: string;
    displayName: string;
    size: 'md' | 'lg';
    configuredInEnv?: string | undefined;
}

export const CatalogLogo: React.FC<CatalogLogoProps> = ({ provider, displayName, size, configuredInEnv }) => {
    const [failedProvider, setFailedProvider] = useState<string | null>(null);
    const hasNoLogo = failedProvider === provider;

    return (
        <div className="relative shrink-0">
            <div
                className={cn(
                    'flex items-center justify-center overflow-hidden rounded-ds-sm border-ds-hairline border-border-default p-1.5',
                    size === 'lg' ? 'size-10' : 'size-9',
                    hasNoLogo ? 'bg-surface-canvas' : 'bg-surface-panel'
                )}
            >
                {hasNoLogo ? (
                    <span className="type-text-medium-xs text-text-secondary">{getInitials(displayName)}</span>
                ) : (
                    <img
                        src={`/images/template-logos/${provider}.svg`}
                        alt=""
                        loading="lazy"
                        className="size-full object-contain"
                        onError={() => setFailedProvider(provider)}
                    />
                )}
            </div>
            {configuredInEnv && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span
                            role="img"
                            aria-label={`Configured in ${configuredInEnv}`}
                            className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-ds-sm bg-icon-success text-icon-on-accent"
                        >
                            <Check className="size-3" />
                        </span>
                    </TooltipTrigger>
                    <TooltipContent>Configured in {configuredInEnv}</TooltipContent>
                </Tooltip>
            )}
        </div>
    );
};
