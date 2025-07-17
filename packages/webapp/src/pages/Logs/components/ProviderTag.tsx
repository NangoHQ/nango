import IntegrationLogo from '../../../components/ui/IntegrationLogo';

import type { SearchOperationsData } from '@nangohq/types';

export const ProviderTag: React.FC<{ msg: Pick<SearchOperationsData, 'providerName' | 'integrationId' | 'integrationName'> }> = ({ msg }) => {
    if (!msg.integrationId || !msg.providerName) {
        return <>-</>;
    }

    return (
        <div className="flex gap-1.5 items-center">
            <div className="w-5">
                <IntegrationLogo provider={msg.providerName} height={4} width={4} color="text-gray-400" />
            </div>
            <div className="truncate font-code text-s">{msg.integrationName}</div>
        </div>
    );
};
