import { IconBook, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParam } from 'react-use';
import { z } from 'zod';

import { ConnectionAdvancedConfig } from './components/ConnectionAdvancedConfig';
import { CreateConnectionSelector } from './components/CreateConnectionSelector';
import { Skeleton } from '../../components/ui/Skeleton';
import { ButtonLink } from '../../components/ui/button/Button';
import { useListIntegration } from '../../hooks/useIntegration';
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
    overrideDocUrl: z.string().optional().or(z.literal(''))
});

export const ConnectionCreate: React.FC = () => {
    const env = useStore((state) => state.env);
    const paramIntegrationId = useSearchParam('integration_id');
    const analyticsTrack = useAnalyticsTrack();

    const { user } = useUser(true);
    const { list: listIntegration, loading } = useListIntegration(env);

    const [integration, setIntegration] = useState<ApiIntegrationList | undefined>();
    const { data: provider } = useProvider(env, integration?.provider);
    const [testUserEmail, setTestUserEmail] = useState(user!.email);
    const [testUserId, setTestUserId] = useState(`test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`);
    const [testUserName, setTestUserName] = useState(user!.name);
    const [testUserTags, setTestUserTags] = useState<Record<string, string>>({});
    const [overrideAuthParams, setOverrideAuthParams] = useState<Record<string, string>>({});
    const [overrideOauthScopes, setOverrideOauthScopes] = useState<string | undefined>(undefined);
    const [overrideDevAppCredentials, setOverrideDevAppCredentials] = useState(false);
    const [overrideDocUrl, setOverrideDocUrl] = useState<string | undefined>(provider?.data.docs_connect);

    const overrideClientId = overrideDevAppCredentials ? '' : undefined;
    const overrideClientSecret = overrideDevAppCredentials ? '' : undefined;

    useEffect(() => {
        setTestUserEmail(user!.email);
        setTestUserId(`test_${user!.name.toLocaleLowerCase().replaceAll(' ', '_')}`);
        setTestUserName(user!.name);
        setTestUserTags({});
        setOverrideAuthParams({});
        setOverrideDevAppCredentials(false);
        setOverrideOauthScopes(integration?.oauth_scopes || undefined);
        setOverrideDocUrl(provider?.data.docs_connect);
    }, [user, integration, provider]);

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

    const validation = useMemo(() => {
        return schema.safeParse({
            testUserId,
            testUserEmail,
            testUserName,
            testUserTags,
            overrideDocUrl
        });
    }, [testUserId, testUserEmail, testUserName, testUserTags, overrideDocUrl]);

    const errors = useMemo(() => {
        if (validation.success) {
            return {};
        }
        return validation.error.flatten().fieldErrors;
    }, [validation]);

    if (loading) {
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

    const isOauth2 = integration && ['OAUTH2', 'MCP_OAUTH2', 'MCP_OAUTH2_GENERIC'].includes(integration.meta.authMode);

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
                            testUserId={testUserId}
                            testUserEmail={testUserEmail}
                            testUserName={testUserName}
                            testUserTags={testUserTags}
                            overrideAuthParams={overrideAuthParams}
                            overrideOauthScopes={overrideOauthScopes}
                            overrideClientId={overrideClientId}
                            overrideClientSecret={overrideClientSecret}
                            overrideDocUrl={overrideDocUrl}
                            isFormValid={validation.success}
                        />
                        <ConnectionAdvancedConfig
                            testUserId={testUserId}
                            setTestUserId={setTestUserId}
                            testUserEmail={testUserEmail}
                            setTestUserEmail={setTestUserEmail}
                            testUserName={testUserName}
                            setTestUserName={setTestUserName}
                            testUserTags={testUserTags}
                            setTestUserTags={setTestUserTags}
                            overrideAuthParams={overrideAuthParams}
                            setOverrideAuthParams={setOverrideAuthParams}
                            overrideOauthScopes={overrideOauthScopes}
                            setOverrideOauthScopes={setOverrideOauthScopes}
                            overrideDevAppCredentials={overrideDevAppCredentials}
                            setOverrideDevAppCredentials={setOverrideDevAppCredentials}
                            overrideDocUrl={overrideDocUrl}
                            setOverrideDocUrl={(val) => setOverrideDocUrl(val)}
                            isOauth2={isOauth2}
                            errors={errors}
                        />
                        <div className="flex gap-4">
                            <ButtonLink
                                to={`/${env}/connections/create-legacy?${integration ? `providerConfigKey=${integration.unique_key}` : ''}`}
                                size="md"
                                variant={'link'}
                            >
                                Or use deprecated flow <IconChevronRight stroke={1} size={18} />
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
