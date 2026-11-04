import { Cog } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '@nangohq/design-system';

import { useStore } from '@/store';
import { ProviderLogo } from './ProviderLogo';

import type { ApiProviderListItem } from '@nangohq/types';

export const ProviderCard = memo(function ProviderCard({ provider, integrationCount }: { provider: ApiProviderListItem; integrationCount: number }) {
    const env = useStore((state) => state.env);
    const counts = [
        { count: provider.actionCount, singular: 'action', plural: 'actions' },
        { count: provider.syncCount, singular: 'sync', plural: 'syncs' }
    ]
        .filter(({ count }) => count > 0)
        .map(({ count, singular, plural }) => `${count} ${count === 1 ? singular : plural}`);

    return (
        <Link
            to={`/${env}/catalog/${provider.name}`}
            className="flex items-center gap-3 p-3 rounded-md border border-border-muted bg-surface-panel transition-colors hover:bg-state-hover hover:border-border-default"
        >
            <ProviderLogo provider={provider} className="size-12 p-2" />
            <div className="flex h-12 min-w-0 flex-col justify-center gap-1">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-text-strong text-body-medium-semi">{provider.displayName}</span>
                    {integrationCount > 0 && (
                        <span className="shrink-0">
                            <Badge variant="success">
                                <Cog />
                                <span className="text-ds-sm">{integrationCount}</span>
                            </Badge>
                        </span>
                    )}
                </div>
                {counts.length > 0 && <span className="truncate text-text-secondary text-body-small-regular">{counts.join(' · ')}</span>}
            </div>
        </Link>
    );
});
