import type { GetIntegration } from '@nangohq/types';
import { SettingsGeneral } from './components/General';
import { SettingsOAuth } from './components/OAuth';
import { useStore } from '../../../../store';
import { useEnvironment } from '../../../../hooks/useEnvironment';

export const SettingsShow: React.FC<{ data: GetIntegration['Success']['data'] }> = ({ data }) => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount, loading } = useEnvironment(env);

    if (loading || !environmentAndAccount) {
        return null;
    }

    return (
        <div>
            <SettingsGeneral data={data} />
            {data.template.auth_mode && <SettingsOAuth data={data} environment={environmentAndAccount.environment} />}
        </div>
    );
};
