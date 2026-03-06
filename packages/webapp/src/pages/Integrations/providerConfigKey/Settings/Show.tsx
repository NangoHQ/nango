import { AppAuthSettings } from './components/AppAuthSettings';
import { AuthSpecificSettings } from './components/AuthSpecificSettings';
import { AwsSigV4Settings } from './components/AwsSigV4Settings';
import { CustomAuthSettings } from './components/CustomAuthSettings';
import { SettingsGeneral } from './components/General';
import { InstallPluginSettings } from './components/InstallPluginSettings';
import { McpGenericSettings } from './components/McpGenericSettings';
import { McpOAuthSettings } from './components/McpOAuthSettings';
import { OAuthSettings } from './components/OAuthSettings';
import { useEnvironment } from '../../../../hooks/useEnvironment';
import { useStore } from '../../../../store';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsSwitch: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data, environment }) => {
    switch (data.template.auth_mode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return <OAuthSettings data={data} environment={environment} />;

        case 'APP':
            return <AppAuthSettings data={data} environment={environment} />;

        case 'CUSTOM':
            return <CustomAuthSettings data={data} environment={environment} />;

        case 'BASIC':
        case 'API_KEY':
        case 'APP_STORE':
        case 'NONE':
        case 'OAUTH2_CC':
        case 'BILL':
        case 'JWT':
        case 'SIGNATURE':
        case 'TWO_STEP':
            return <AuthSpecificSettings data={data} environment={environment} />;
        case 'AWS_SIGV4':
            return <AwsSigV4Settings data={data} environment={environment} />;
        case 'MCP_OAUTH2':
            return <McpOAuthSettings data={data} environment={environment} />;
        case 'MCP_OAUTH2_GENERIC':
            return <McpGenericSettings data={data} environment={environment} />;
        case 'INSTALL_PLUGIN':
            return <InstallPluginSettings data={data} environment={environment} />;

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
