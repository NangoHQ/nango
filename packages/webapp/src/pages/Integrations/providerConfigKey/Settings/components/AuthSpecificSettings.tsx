import { AppAuthSettings } from './AppAuthSettings';
import { CustomAuthSettings } from './CustomAuthSettings';
import { InstallPluginSettings } from './InstallPluginSettings';
import { McpGenericSettings } from './McpGenericSettings';
import { McpOAuthSettings } from './McpOAuthSettings';
import { OAuthSettings } from './OAuthSettings';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const AuthSpecificSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data, environment }) => {
    const authMode = data.template.auth_mode;

    switch (authMode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return <OAuthSettings data={data} environment={environment} />;

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
};
