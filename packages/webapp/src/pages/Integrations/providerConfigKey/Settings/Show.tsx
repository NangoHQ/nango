import type { GetIntegration } from '@nangohq/types';
import { SettingsGeneral } from './components/General';
import { SettingsOAuth } from './components/OAuth';
import { useStore } from '../../../../store';
import { useEnvironment } from '../../../../hooks/useEnvironment';
import type { EnvironmentAndAccount } from '@nangohq/server';
import { SettingsApp } from './components/App';
import { SettingsCustom } from './components/Custom';
import { SettingsDefault } from './components/Default';

export const SettingsSwitch: React.FC<{ data: GetIntegration['Success']['data']; environment: EnvironmentAndAccount['environment'] }> = ({
    data,
    environment
}) => {
    switch (data.template.auth_mode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return <SettingsOAuth data={data} environment={environment} />;

        case 'APP':
            return <SettingsApp data={data} environment={environment} />;

        case 'CUSTOM':
            return <SettingsCustom data={data} environment={environment} />;

        case 'BASIC':
        case 'API_KEY':
        case 'APP_STORE':
        case 'TABLEAU':
        case 'NONE':
        case 'OAUTH2_CC':
        case 'BILL':
        case 'JWT':
        case 'SIGNATURE':
        case 'TWO_STEP':
            return <SettingsDefault data={data} environment={environment} />;

        default:
            return <div>Unsupported</div>;
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
