import { DeleteIntegrationButton } from './Delete';
import { useStore } from '../../../../../store';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsDefault: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data: { integration } }) => {
    const env = useStore((state) => state.env);

    return (
        <div className="mt-10">
            <div className="flex flex-col gap-10 mt-10">
                <div className="flex justify-between">{integration && <DeleteIntegrationButton env={env} integration={integration} />}</div>
            </div>
        </div>
    );
};
