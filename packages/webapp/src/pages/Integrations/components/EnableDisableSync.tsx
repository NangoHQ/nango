import { useState } from 'react';
import ToggleButton from '../../../components/ui/button/ToggleButton';
import Spinner from '../../../components/ui/Spinner';
import type { GetIntegration } from '@nangohq/types';
import type { NangoSyncConfigWithEndpoint } from '../providerConfigKey/Endpoints/components/List';

export interface FlowProps {
    flow: NangoSyncConfigWithEndpoint;
    integration: GetIntegration['Success']['data']['integration'];
}

export const EnableDisableSync: React.FC<FlowProps> = ({ flow }) => {
    const [loading] = useState(false);

    const toggleSync = () => {};

    return (
        <div>
            <div className="flex">
                {loading && <Spinner size={1} />}
                <ToggleButton enabled={flow.enabled || false} onChange={() => toggleSync()} />
            </div>
        </div>
    );
};
