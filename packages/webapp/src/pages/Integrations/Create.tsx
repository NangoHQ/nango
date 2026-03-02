import { BookOpen } from 'lucide-react';
import { Helmet } from 'react-helmet';
import { useNavigate, useParams } from 'react-router-dom';

import { CardContent, CardHeader, CardLayout } from './components/CardLayout';
import { AuthCreateForm } from './components/forms/AuthCreateForm';
import { getDisplayName } from './utils';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Badge } from '@/components-v2/ui/badge';
import { ButtonLink } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { usePostIntegration } from '@/hooks/useIntegration';
import { useProvider } from '@/hooks/useProvider';
import { useToast } from '@/hooks/useToast';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

import type { PostIntegration } from '@nangohq/types';

export const CreateIntegration = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const navigate = useNavigate();
    const { mutateAsync: postIntegration } = usePostIntegration(env);

    const { providerConfigKey } = useParams();
    const { data: providerData, isLoading: loadingProvider } = useProvider(env, providerConfigKey);

    const provider = providerData?.data;

    const onSubmit = async (data: PostIntegration['Body']) => {
        if (!provider) {
            return;
        }

        try {
            const response = await postIntegration(data);
            navigate(`/${env}/integrations/${response.data.unique_key}/settings`);
        } catch {
            toast({ title: 'Failed to create integration', variant: 'error' });
        }
    };

    if (loadingProvider || !provider) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Create integration - Nango</title>
                </Helmet>

                <CardLayout>
                    <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex flex-col gap-6">
                                <div className="inline-flex gap-2 items-center">
                                    <Skeleton className="bg-bg-subtle size-10.5" />
                                    <Skeleton className="bg-bg-subtle w-36 h-5" />
                                </div>
                                <Skeleton className="bg-bg-subtle w-64 h-5" />
                            </div>
                            <Skeleton className="bg-bg-subtle w-38 h-8" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="bg-bg-subtle w-full h-20" />
                    </CardContent>
                </CardLayout>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <Helmet>
                <title>Create integration - Nango</title>
            </Helmet>

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
                    <AuthCreateForm provider={provider} onSubmit={onSubmit} />
                </CardContent>
            </CardLayout>
        </DashboardLayout>
    );
};
