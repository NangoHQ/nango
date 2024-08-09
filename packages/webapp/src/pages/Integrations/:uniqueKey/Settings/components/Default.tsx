import type { GetIntegration } from '@nangohq/types';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { DeleteIntegrationButton } from './Delete';
import { useStore } from '../../../../../store';

export const SettingsDefault: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data: { integration }
}) => {
    const env = useStore((state) => state.env);

    return (
        <div className="mt-10">
            <div className="flex flex-col gap-10 mt-10">
                <div className="flex justify-between">{integration && <DeleteIntegrationButton env={env} integration={integration} />}</div>
            </div>
        </div>
    );
};
