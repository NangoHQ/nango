import { AppAuthCreateForm } from './AppAuthCreateForm';
import { CustomAuthCreateForm } from './CustomAuthCreateForm';
import { DefaultCreateForm } from './DefaultCreateForm';
import { InstallPluginAuthCreateForm } from './InstallPluginAuthCreateForm';
import { McpGenericCreateForm } from './McpGenericCreateForm';
import { McpOAuthCreateForm } from './McpOAuthCreateForm';
import { OAuthCreateForm } from './OAuthCreateForm';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

interface Props {
    provider: ApiProviderListItem;
    onSubmit?: (data: PostIntegration['Body']) => Promise<void>;
}

export const AuthCreateForm: React.FC<Props> = ({ provider, onSubmit }) => {
    const authMode = provider.authMode;

    switch (authMode) {
        case 'OAUTH1':
        case 'OAUTH2':
        case 'TBA':
            return <OAuthCreateForm provider={provider} onSubmit={onSubmit} />;

        case 'APP':
            return <AppAuthCreateForm provider={provider} onSubmit={onSubmit} />;

        case 'CUSTOM':
            return <CustomAuthCreateForm provider={provider} onSubmit={onSubmit} />;

        case 'MCP_OAUTH2':
            return <McpOAuthCreateForm provider={provider} onSubmit={onSubmit} />;

        case 'MCP_OAUTH2_GENERIC':
            return <McpGenericCreateForm provider={provider} onSubmit={onSubmit} />;

        case 'INSTALL_PLUGIN':
            return <InstallPluginAuthCreateForm provider={provider} onSubmit={onSubmit} />;

        default:
            return <DefaultCreateForm provider={provider} onSubmit={onSubmit} />;
    }
};
