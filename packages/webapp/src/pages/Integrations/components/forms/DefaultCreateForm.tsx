import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

const getInfoMessage = (provider: ApiProviderListItem): string | null => {
    switch (provider.authMode) {
        case 'BASIC':
            return "This API uses basic auth. Nothing to configure here, Nango will ask for the user's basic credentials as part of the auth flow.";
        case 'API_KEY':
            return 'This API uses API key auth. Nothing to configure here, Nango will ask the user for an API key as part of the auth flow.';
    }

    return `Nothing to configure here.`;
};

export const DefaultCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
    provider,
    onSubmit
}) => {
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
};
