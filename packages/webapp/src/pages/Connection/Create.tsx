import { zodResolver } from '@hookform/resolvers/zod';
import { IconBook } from '@tabler/icons-react';
import { ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useForm } from 'react-hook-form';
import { useSearchParam } from 'react-use';
import { z } from 'zod';

import { ConnectionAdvancedConfig } from './components/ConnectionAdvancedConfig';
import { CreateConnectionSelector } from './components/CreateConnectionSelector';
import { Skeleton } from '../../components/ui/Skeleton';
import { ButtonLink } from '../../components/ui/button/Button';
import { Form } from '../../components-v2/ui/form';
import { useListIntegrations } from '../../hooks/useIntegration';
import { useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { useProvider } from '@/hooks/useProvider';

import type { ApiIntegrationList } from '@nangohq/types';

const schema = z.object({
    testUserId: z.string().min(1, 'User ID is required').max(255, 'User ID must be less than 255 characters'),
    testUserEmail: z.string().email('Invalid email address').min(5).optional().or(z.literal('')),
    testUserName: z.string().max(255, 'Display name must be less than 255 characters').optional(),
    testUserTags: z.record(z.string(), z.string()).refine((tags) => Object.keys(tags).length < 64, 'Max 64 tags allowed'),
    overrideAuthParams: z.record(z.string(), z.string()),
    overrideOauthScopes: z.string().optional(),
    overrideDevAppCredentials: z.boolean(),
    overrideDocUrl: z.string().optional().or(z.literal(''))
});

export type ConnectionFormData = z.infer<typeof schema>;

export const ConnectionCreate: React.FC = () => {
    const env = useStore((state) => state.env);
    const paramIntegrationId = useSearchParam('integration_id');
    const analyticsTrack = useAnalyticsTrack();

    const { user } = useUser(true);
    const { data: listIntegrationData, isLoading } = useListIntegrations(env);
    const listIntegration = listIntegrationData?.data;

    const [integration, setIntegration] = useState<ApiIntegrationList | undefined>();
    const { data: provider } = useProvider(env, integration?.provider);

    const form = useForm<ConnectionFormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            testUserId: `test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`,
            testUserEmail: user!.email,
            testUserName: user!.name,
            testUserTags: {},
            overrideAuthParams: {},
            overrideOauthScopes: undefined,
            overrideDevAppCredentials: false,
            overrideDocUrl: ''
        },
        mode: 'onChange'
    });

    const formValues = form.watch();

    const overrideClientId = formValues.overrideDevAppCredentials ? '' : undefined;
    const overrideClientSecret = formValues.overrideDevAppCredentials ? '' : undefined;

    // Reset form when integration changes
    useEffect(() => {
        form.reset({
            testUserId: `test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`,
            testUserEmail: user!.email,
            testUserName: user!.name,
            testUserTags: {},
            overrideAuthParams: integration?.meta.authorizationParams ?? {},
            overrideOauthScopes: integration?.oauth_scopes || undefined,
            overrideDevAppCredentials: false,
            overrideDocUrl: ''
        });
    }, [user, integration, form]);

    // Update docUrl when provider loads
    useEffect(() => {
        if (provider?.data.docs_connect) {
            form.setValue('overrideDocUrl', provider.data.docs_connect);
        }
    }, [provider, form]);

    useEffect(() => {
        analyticsTrack('web:create_connection:viewed');
    }, [analyticsTrack]);

    useEffect(() => {
        if (paramIntegrationId && listIntegration) {
            const exists = listIntegration.find((v) => v.unique_key === paramIntegrationId);
            if (exists) {
                setIntegration(exists);
            }
        }
    }, [paramIntegrationId, listIntegration]);

    const isOauth2 = useMemo(() => {
        return integration && ['OAUTH2', 'MCP_OAUTH2', 'MCP_OAUTH2_GENERIC'].includes(integration.meta.authMode);
    }, [integration]);

    if (isLoading) {
        return (
            <DashboardLayout>
                <Helmet>
                    <title>Create Test Connection - Nango</title>
                </Helmet>
                <div className="grid grid-cols-2 text-white">
                    <div className="pr-10 flex flex-col gap-10">
                        <h1 className="text-2xl">Create test connection</h1>
                        <div className="flex flex-col gap-4">
                            <Skeleton className="w-full h-10" />
                            <Skeleton className="w-full" />
                            <Skeleton className="w-full" />
                        </div>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout fullWidth className={'max-w-[1250px]'}>
            <Helmet>
                <title>Create Test Connection - Nango</title>
            </Helmet>
            <div className="grid grid-cols-[2fr_1fr] text-white">
                <div className="pr-5">
                    <div className="flex flex-col gap-8">
                        <h1 className="text-2xl">Create a test connection</h1>
                        <CreateConnectionSelector
                            integration={integration}
                            setIntegration={setIntegration}
                            testUserId={formValues.testUserId ?? ''}
                            testUserEmail={formValues.testUserEmail ?? ''}
                            testUserName={formValues.testUserName ?? ''}
                            testUserTags={formValues.testUserTags ?? {}}
                            overrideAuthParams={formValues.overrideAuthParams ?? {}}
                            overrideOauthScopes={formValues.overrideOauthScopes}
                            overrideClientId={overrideClientId}
                            overrideClientSecret={overrideClientSecret}
                            overrideDocUrl={formValues.overrideDocUrl}
                            defaultDocUrl={provider?.data.docs_connect}
                            isFormValid={form.formState.isValid}
                        />
                        <Form {...form}>
                            <ConnectionAdvancedConfig isOauth2={isOauth2} />
                        </Form>
                        <div className="flex gap-4">
                            <ButtonLink
                                to={`/${env}/connections/create-legacy?${integration ? `providerConfigKey=${integration.unique_key}` : ''}`}
                                size="md"
                                variant={'link'}
                                className={'text-breadcrumb-default'}
                            >
                                Use deprecated flow <ExternalLink className="size-4.5 text-breadcrumb-default" />
                            </ButtonLink>
                        </div>
                    </div>
                </div>
                <div className="border-l border-l-grayscale-800 pl-10">
                    <div className="flex flex-col gap-10">
                        <h1 className="text-2xl">Embed in your app</h1>
                        <a
                            className="transition-all block border rounded-lg border-grayscale-700 p-7 group hover:border-gray-600 hover:shadow-card focus:shadow-card focus:border-gray-600 focus:outline-0"
                            href="https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <header className="flex justify-between">
                                <div className="flex gap-3 items-start">
                                    <h2>Authorize users from your app</h2>
                                </div>
                                <div className="rounded-full border border-grayscale-700 p-1.5 h-8 w-8">
                                    <IconBook stroke={1} size={18} />
                                </div>
                            </header>
                            <main>
                                <p className="text-sm text-grayscale-400">
                                    Learn how to embed Nango in your app to let users authorize 3rd-party APIs seamlessly.
                                </p>
                            </main>
                        </a>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};
