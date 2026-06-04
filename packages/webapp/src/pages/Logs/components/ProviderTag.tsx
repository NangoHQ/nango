import { IntegrationLogo } from '@/components-v2/patterns/IntegrationLogo';

import type { SearchOperationsData } from '@nangohq/types';

export const ProviderTag: React.FC<{ msg: Pick<SearchOperationsData, 'providerName' | 'integrationId' | 'integrationName'> }> = ({ msg }) => {
    if (!msg.integrationId || !msg.providerName) {
        return <>-</>;
    }

    return (
        <div className="flex gap-1.5 items-center">
            <IntegrationLogo provider={msg.providerName} className="size-4 p-0 bg-transparent border-transparent" />
            <div className="truncate font-code text-s">{msg.integrationName}</div>
        </div>
    );
};
