import { AppAuthSettings } from './AppAuthSettings';
import { CustomAuthSettings } from './CustomAuthSettings';
import { CustomIntegrationSettings } from './CustomIntegrationSettings';
import { InstallPluginSettings } from './InstallPluginSettings';
import { McpGenericSettings } from './McpGenericSettings';
import { McpOAuthSettings } from './McpOAuthSettings';
import { OAuth2CCSettings } from './OAuth2CCSettings';
import { OAuthSettings } from './OAuthSettings';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

function AuthModeSettings({ data, environment }: { data: GetIntegration['Success']['data']; environment: ApiEnvironment }) {
    switch (data.template.auth_mode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return <OAuthSettings data={data} environment={environment} />;

        case 'OAUTH2_CC':
            return <OAuth2CCSettings data={data} environment={environment} />;

        case 'APP':
            return <AppAuthSettings data={data} environment={environment} />;

        case 'CUSTOM':
            return <CustomAuthSettings data={data} environment={environment} />;

        case 'MCP_OAUTH2':
            return <McpOAuthSettings data={data} environment={environment} />;

        case 'MCP_OAUTH2_GENERIC':
            return <McpGenericSettings data={data} environment={environment} />;

        case 'INSTALL_PLUGIN':
            return <InstallPluginSettings data={data} environment={environment} />;

        default:
            return null;
    }
}

export const AuthSpecificSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data, environment }) => {
    const hasCustomIntegrationConfig =
        data.template.integration_config && Object.keys(data.template.integration_config).length > 0 && !data.integration.shared_credentials_id;

    return (
        <>
            <AuthModeSettings data={data} environment={environment} />
            {hasCustomIntegrationConfig && <CustomIntegrationSettings data={data} environment={environment} />}
        </>
    );
};
