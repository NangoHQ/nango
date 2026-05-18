import { GenericApiKeyAuthPresentationForm } from './GenericApiKeyAuthPresentationForm';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

export const GenericApiKeyCreateForm: React.FC<{ provider: ApiProviderListItem; onSubmit?: (data: PostIntegration['Body']) => Promise<void> }> = ({
    provider,
    onSubmit
}) => {
    return (
        <GenericApiKeyAuthPresentationForm
            submitLabel="Create"
            onSubmit={(genericApiKey) =>
                onSubmit?.({
                    provider: provider.name,
                    useSharedCredentials: false,
                    generic_api_key: genericApiKey
                }) ?? Promise.resolve()
            }
        />
    );
};
