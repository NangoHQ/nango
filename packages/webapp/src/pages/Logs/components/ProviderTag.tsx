import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';

import type { SearchOperationsData } from '@nangohq/types';

export const ProviderTag: React.FC<{ msg: Pick<SearchOperationsData, 'providerName' | 'integrationId' | 'integrationName'> }> = ({ msg }) => {
    if (!msg.integrationId || !msg.providerName) {
        return <>-</>;
    }

    return (
        <div className="flex gap-1.5 items-center min-w-0">
            <IntegrationLogo provider={msg.providerName} className="size-4 p-0 bg-transparent border-transparent shrink-0" />
            <div className="truncate font-code text-s min-w-0">{msg.integrationName}</div>
        </div>
    );
};
