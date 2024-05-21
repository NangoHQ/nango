import type { SearchMessagesData } from '@nangohq/types';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';

export const ProviderTag: React.FC<{ msg: SearchMessagesData }> = ({ msg }) => {
    if (!msg.configId || !msg.providerName) {
        return null;
    }

    return (
        <div className="flex gap-1.5 items-center">
            <div className="w-5">
                <IntegrationLogo provider={msg.providerName} height={4} width={4} color="text-gray-400" />
            </div>
            <div className="truncate font-code text-s">{msg.configName}</div>
        </div>
    );
};
