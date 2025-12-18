import { AuthSpecificSettings } from './components/AuthSpecificSettings';
import { DeleteIntegrationButton } from './components/DeleteIntegrationButton';
import { GeneralSettings } from './components/GeneralSettings';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsTab: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data, environment }) => {
    return (
        <div className="flex-1 flex flex-col gap-10">
            <GeneralSettings data={data} environment={environment} />
            <AuthSpecificSettings data={data} environment={environment} />
            <DeleteIntegrationButton env={environment.name} integration={data.integration} className="self-end" />
        </div>
    );
};
