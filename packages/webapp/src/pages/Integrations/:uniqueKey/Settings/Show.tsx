import type { GetIntegration } from '@nangohq/types';
import { SettingsGeneral } from './components/General';
import { SettingsOAuth } from './components/OAuth';
import { useStore } from '../../../../store';
import { useEnvironment } from '../../../../hooks/useEnvironment';
import { SettingsAPIKey } from './components/APIKey';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { SettingsBasic } from './components/Basic';
import { SettingsApp } from './components/App';

export const SettingsSwitch: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data,
    environment
}) => {
    switch (data.template.auth_mode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'OAUTH2_CC':
            return <SettingsOAuth data={data} environment={environment} />;

        case 'API_KEY':
            return <SettingsAPIKey data={data} environment={environment} />;

        case 'BASIC':
            return <SettingsBasic data={data} environment={environment} />;

        case 'APP':
            return <SettingsApp data={data} environment={environment} />;

        default:
            return null;
    }
};

export const SettingsShow: React.FC<{ data: GetIntegration['Success']['data'] }> = ({ data }) => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount, loading } = useEnvironment(env);

    if (loading || !environmentAndAccount) {
        return null;
    }

    return (
        <div>
            <SettingsGeneral data={data} environment={environmentAndAccount.environment} />
            <SettingsSwitch data={data} environment={environmentAndAccount.environment} />
        </div>
    );
};
