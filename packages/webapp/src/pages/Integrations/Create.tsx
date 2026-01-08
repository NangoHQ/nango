import { BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { CardContent, CardHeader, CardLayout } from './components/CardLayout';
import { OAuthCreateForm } from './components/forms/OAuthCreateForm';
import { getDisplayName } from './utils';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Badge } from '@/components-v2/ui/badge';
import { Button, ButtonLink } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { apiPostIntegration } from '@/hooks/useIntegration';
import { useProvider } from '@/hooks/useProvider';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

import type { ApiProviderListItem, PostIntegration } from '@nangohq/types';

export const CreateIntegration = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const navigate = useNavigate();

    const { providerConfigKey } = useParams();
    const { data: providerData, isLoading: loadingProvider } = useProvider(env, providerConfigKey!);

    const provider = providerData?.data;

    const onSubmit = async (data: PostIntegration['Body']) => {
        if (!provider) {
            return;
        }

        const response = await apiPostIntegration(env, data);

        if ('error' in response.json) {
            toast({ title: response.json.error.message || 'Failed to create integration', variant: 'error' });
            return;
        }

        navigate(`/${env}/integrations/${response.json.data.unique_key}/settings`);
    };

    if (loadingProvider || !provider) {
        return <Skeleton className="size-10.5" />;
    }

    return (
        <DashboardLayout>
            <CardLayout>
                <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-6">
                            <div className="inline-flex gap-2 items-center">
                                <IntegrationLogo provider={provider.name} className="size-10.5" />
                                <span className="text-text-primary text-body-medium-semi">{provider.displayName}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 gap-y-2">
                                {provider.authMode !== 'NONE' && <Badge variant="brand">{getDisplayName(provider.authMode)}</Badge>}
                                {provider.categories?.map((category) => (
                                    <Badge key={category} variant="ghost">
                                        {category}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        <ButtonLink to={provider.docs} variant="secondary">
                            <BookOpen />
                            Full setup guide
                        </ButtonLink>
                    </div>
                </CardHeader>
                <CardContent>
                    <Content provider={provider} onSubmit={onSubmit} />
                </CardContent>
            </CardLayout>
        </DashboardLayout>
    );
};

const getInfoMessage = (provider: ApiProviderListItem): string | null => {
    switch (provider.authMode) {
        case 'BASIC':
            return "This API uses basic auth. Nothing to configure here, Nango will ask for the user's basic credentials as part of the auth flow.";
        case 'API_KEY':
            return 'This API uses API key auth. Nothing to configure here, Nango will ask the user for an API key as part of the auth flow.';
    }

    return `This API uses ${getDisplayName(provider.authMode)}. Nothing to configure here.`;
};

const Content = ({ provider, onSubmit }: { provider: ApiProviderListItem; onSubmit: (data: PostIntegration['Body']) => Promise<void> }) => {
    if (['OAUTH1', 'OAUTH2', 'TBA'].includes(provider.authMode)) {
        return <OAuthCreateForm provider={provider} onSubmit={onSubmit} />;
    }

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
                    onSubmit({
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
