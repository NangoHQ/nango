import { AppAuthCreateForm } from './AppAuthCreateForm';
import { CustomAuthCreateForm } from './CustomAuthCreateForm';
import { InstallPluginAuthCreateForm } from './InstallPluginAuthCreateForm';
import { McpGenericCreateForm } from './McpGenericCreateForm';
import { McpOAuthCreateForm } from './McpOAuthCreateForm';
import { OAuthCreateForm } from './OAuthCreateForm';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

interface Props {
    provider: ApiProviderListItem;
    onSubmit?: (data: PostIntegration['Body']) => Promise<void>;
}

const getInfoMessage = (provider: ApiProviderListItem): string | null => {
    switch (provider.authMode) {
        case 'BASIC':
            return "This API uses basic auth. Nothing to configure here, Nango will ask for the user's basic credentials as part of the auth flow.";
        case 'API_KEY':
            return 'This API uses API key auth. Nothing to configure here, Nango will ask the user for an API key as part of the auth flow.';
    }

    return `Nothing to configure here.`;
};

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

        default: {
            const infoMessage = getInfoMessage(provider);
            return (
                <div className="flex flex-col gap-8">
                    {infoMessage && (
                        <Alert variant="info">
                            <AlertDescription>{infoMessage}</AlertDescription>
                        </Alert>
                    )}
                    <Button
                        variant="primary"
                        onClick={() =>
                            onSubmit?.({
                                provider: provider.name,
                                useSharedCredentials: false
                            })
                        }
                    >
                        Create
                    </Button>
                </div>
            );
        }
    }
};
