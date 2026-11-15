import { ArrowRight, Zap } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipTrigger } from '@nangohq/design-system';

import { trackCatalogCardClick } from '../analytics';
import { getCardMeta, getInstantSetup } from '../catalog.utils';
import { CatalogLogo } from './CatalogLogo';

import type { InstantSetup } from '../catalog.utils';
import type { ApiProviderListItem } from '@nangohq/types';

interface CatalogCardProps {
    provider: ApiProviderListItem;
    env: string;
    isConfigured: boolean;
}

export const CatalogCard = memo(function CatalogCard({ provider, env, isConfigured }: CatalogCardProps) {
    const instantSetup = getInstantSetup(provider);

    return (
        <Link
            to={`/${env}/catalog/${provider.name}`}
            onClick={() => trackCatalogCardClick({ provider: provider.name, is_instant_setup: instantSetup !== null, is_configured: isConfigured })}
            className="group flex min-w-0 items-center gap-3 rounded-ds-md border-ds-hairline border-border-default bg-surface-panel p-3 transition-colors hover:border-border-strong focus-default"
        >
            <CatalogLogo provider={provider.name} displayName={provider.displayName} size="md" configuredInEnv={isConfigured ? env : undefined} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate type-text-medium-md text-text-strong">{provider.displayName}</span>
                    {instantSetup && <InstantSetupIcon instantSetup={instantSetup} />}
                </div>
                <span className="truncate type-text-regular-xs text-text-secondary">{getCardMeta(provider)}</span>
            </div>
            <ArrowRight className="size-4 shrink-0 -translate-x-1 text-icon-secondary opacity-0 transition duration-[var(--ds-motion-duration-fast)] group-hover:translate-x-0 group-hover:opacity-100" />
        </Link>
    );
});

const INSTANT_SETUP_TOOLTIPS: Record<NonNullable<InstantSetup>, string> = {
    managed: 'Instant setup · Nango-managed OAuth app',
    'no-dev-app': 'Instant setup · No developer app needed'
};

const InstantSetupIcon: React.FC<{ instantSetup: NonNullable<InstantSetup> }> = ({ instantSetup }) => (
    <Tooltip>
        <TooltipTrigger asChild>
            <Zap aria-label={INSTANT_SETUP_TOOLTIPS[instantSetup]} className="size-3 shrink-0 fill-icon-link text-icon-link" />
        </TooltipTrigger>
        <TooltipContent>{INSTANT_SETUP_TOOLTIPS[instantSetup]}</TooltipContent>
    </Tooltip>
);
