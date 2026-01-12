import { IconBook, IconChevronRight, IconHelpCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useSearchParam } from 'react-use';
import { z } from 'zod';

import { CreateConnectionSelector } from './components/CreateConnectionSelector';
import { SimpleTooltip } from '../../components/SimpleTooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/Collapsible';
import { Skeleton } from '../../components/ui/Skeleton';
import { ButtonLink } from '../../components/ui/button/Button';
import { KeyValueInput } from '../../components-v2/KeyValueInput';
import { ScopesInput } from '../../components-v2/ScopesInput';
import { BinaryToggle } from '../../components-v2/ui/binary-toggle';
import { Input } from '../../components-v2/ui/input';
import { Separator } from '../../components-v2/ui/separator';
import { useListIntegration } from '../../hooks/useIntegration';
import { useUser } from '../../hooks/useUser';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { useAnalyticsTrack } from '../../utils/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { useProvider } from '@/hooks/useProvider';

import type { ApiIntegrationList } from '@nangohq/types';

const schema = z.object({
    testUserId: z.string().min(1, 'User ID is required').max(255, 'User ID must be less than 255 characters'),
    testUserEmail: z.string().email('Invalid email address').min(5).optional().or(z.literal('')),
    testUserName: z.string().max(255, 'Display name must be less than 255 characters').optional(),
    testUserTags: z.record(z.string(), z.string()).refine((tags) => Object.keys(tags).length < 64, 'Max 64 tags allowed'),
    overrideDocUrl: z.string().optional().or(z.literal(''))
});

const ErrorMessage = ({ message }: { message?: string }) => {
    if (!message) {
        return null;
    }
    return <p className="text-xs text-feedback-error-text mt-1">{message}</p>;
};

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
        analyticsTrack('Create Connection Page Viewed');
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
                        <Card className={'dark:bg-bg-elevated rounded dark:border-neutral-900 gap-2.5'}>
                            <Collapsible>
                                <CollapsibleTrigger className="" asChild>
                                    <CardHeader className={'flex flex-row items-center justify-between p-6 [&[data-state=open]_svg]:rotate-90 cursor-pointer'}>
                                        <div className="flex flex-col gap-1.5">
                                            <CardTitle>Advanced configuration</CardTitle>
                                            <CardDescription>Configure advanced settings for your connection</CardDescription>
                                        </div>
                                        <IconChevronRight size={18} stroke={1} className="transition-transform duration-200" />
                                    </CardHeader>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="flex flex-col gap-8">
                                    <CardContent className="flex flex-col gap-8">
                                        <div className="flex flex-col gap-4">
                                            <h3 className="text-xs font-medium uppercase text-text-secondary">End User</h3>
                                            <div className="flex flex-col gap-4">
                                                <label htmlFor="test_user_id" className="flex gap-2 items-center text-sm font-medium">
                                                    ID
                                                    <span className="text-alert-400">*</span>
                                                    <SimpleTooltip
                                                        side="right"
                                                        align="center"
                                                        tooltipContent={
                                                            <p className="text-s">
                                                                Uniquely identifies the end user.
                                                                <br />
                                                                <Link
                                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-id"
                                                                    className="underline"
                                                                    target="_blank"
                                                                >
                                                                    Documentation
                                                                </Link>
                                                            </p>
                                                        }
                                                    >
                                                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                    </SimpleTooltip>
                                                </label>
                                                <Input
                                                    id="test_user_id"
                                                    placeholder="Your user internal ID"
                                                    value={testUserId}
                                                    onChange={(e) => setTestUserId(e.target.value)}
                                                    aria-invalid={!!errors.testUserId}
                                                />
                                                <ErrorMessage message={errors.testUserId?.[0]} />
                                            </div>
                                            <div className="flex flex-col gap-4">
                                                <label htmlFor="test_user_email" className="flex gap-2 items-center text-sm font-medium">
                                                    Email
                                                    <span className="text-alert-400">*</span>
                                                    <SimpleTooltip
                                                        side="right"
                                                        align="center"
                                                        tooltipContent={
                                                            <p className="text-s">
                                                                User&apos;s email.
                                                                <br />
                                                                <Link
                                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-email"
                                                                    className="underline"
                                                                    target="_blank"
                                                                >
                                                                    Documentation
                                                                </Link>
                                                            </p>
                                                        }
                                                    >
                                                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                    </SimpleTooltip>
                                                </label>
                                                <Input
                                                    id="test_user_email"
                                                    placeholder="you@email.com"
                                                    autoComplete="email"
                                                    type="email"
                                                    value={testUserEmail}
                                                    onChange={(e) => setTestUserEmail(e.target.value)}
                                                    aria-invalid={!!errors.testUserEmail}
                                                />
                                                <ErrorMessage message={errors.testUserEmail?.[0]} />
                                            </div>
                                            <div className="flex flex-col gap-4">
                                                <label htmlFor="test_user_display_name" className="flex gap-2 items-center text-sm font-medium">
                                                    Display Name
                                                    <SimpleTooltip
                                                        side="right"
                                                        align="center"
                                                        tooltipContent={
                                                            <p className="text-s">
                                                                User display name.
                                                                <br />
                                                                <Link
                                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-end-user-display-name"
                                                                    className="underline"
                                                                    target="_blank"
                                                                >
                                                                    Documentation
                                                                </Link>
                                                            </p>
                                                        }
                                                    >
                                                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                    </SimpleTooltip>
                                                </label>
                                                <Input
                                                    id="test_user_display_name"
                                                    placeholder="Your user internal ID"
                                                    value={testUserName}
                                                    onChange={(e) => setTestUserName(e.target.value)}
                                                    aria-invalid={!!errors.testUserName}
                                                />
                                                <ErrorMessage message={errors.testUserName?.[0]} />
                                            </div>
                                            <div className="flex flex-col gap-4">
                                                <label className="flex gap-2 items-center text-sm font-medium">
                                                    Tags
                                                    <SimpleTooltip
                                                        side="right"
                                                        align="center"
                                                        tooltipContent={
                                                            <p className="text-s">
                                                                Tags associated with the end user. Only accepts strings values, up to 64 keys.
                                                                <br />
                                                                <Link
                                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create"
                                                                    className="underline"
                                                                    target="_blank"
                                                                >
                                                                    Documentation
                                                                </Link>
                                                            </p>
                                                        }
                                                    >
                                                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                    </SimpleTooltip>
                                                </label>
                                                <KeyValueInput
                                                    initialValues={testUserTags}
                                                    onChange={setTestUserTags}
                                                    placeholderKey="Tag Name"
                                                    placeholderValue="Tag Value"
                                                />
                                                <ErrorMessage message={errors.testUserTags?.[0]} />
                                            </div>
                                        </div>

                                        <Separator className="bg-border-muted" />

                                        <div className="flex flex-col gap-4">
                                            <h3 className="text-xs font-large uppercase text-text-secondary">Overrides</h3>
                                            {isOauth2 && (
                                                <>
                                                    <div className="flex flex-col gap-4">
                                                        <label className="flex gap-2 items-center text-sm font-medium">
                                                            Override authorization parameters
                                                            <SimpleTooltip
                                                                side="right"
                                                                align="center"
                                                                tooltipContent={
                                                                    <p className="text-s">
                                                                        Query params passed to the OAuth flow (for OAuth2 only)
                                                                        <br />
                                                                        <Link
                                                                            to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-authorization-params"
                                                                            className="underline"
                                                                            target="_blank"
                                                                        >
                                                                            Documentation
                                                                        </Link>
                                                                    </p>
                                                                }
                                                            >
                                                                <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                            </SimpleTooltip>
                                                        </label>
                                                        <KeyValueInput
                                                            initialValues={overrideAuthParams}
                                                            onChange={setOverrideAuthParams}
                                                            placeholderKey="Param Name"
                                                            placeholderValue="Param Value"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-4">
                                                        <label className="flex gap-2 items-center text-sm font-medium">
                                                            Override developer app credentials
                                                            <SimpleTooltip
                                                                side="right"
                                                                align="center"
                                                                tooltipContent={
                                                                    <p className="text-s">
                                                                        Allow end users to provide their own OAuth client ID and secret.
                                                                        <br />
                                                                        <Link
                                                                            to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-client-id-override"
                                                                            className="underline"
                                                                            target="_blank"
                                                                        >
                                                                            Documentation
                                                                        </Link>
                                                                    </p>
                                                                }
                                                            >
                                                                <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                            </SimpleTooltip>
                                                        </label>
                                                        <BinaryToggle
                                                            value={overrideDevAppCredentials}
                                                            onChange={setOverrideDevAppCredentials}
                                                            offLabel="No override"
                                                            onLabel="End-user provided"
                                                            offTooltip="Use the OAuth credentials configured in the integration settings"
                                                            onTooltip="End users will provide their own OAuth client ID and secret"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-4">
                                                        <label htmlFor="override_scopes" className="flex gap-2 items-center text-sm font-medium">
                                                            Override OAuth scopes
                                                            <SimpleTooltip
                                                                side="right"
                                                                align="center"
                                                                tooltipContent={
                                                                    <p className="text-s">
                                                                        Override oauth scopes
                                                                        <br />
                                                                        <Link
                                                                            to="https://nango.dev/docs/reference/api/connect/sessions/create#body-integrations-config-defaults-additional-properties-connection-config-oauth-scopes-override"
                                                                            className="underline"
                                                                            target="_blank"
                                                                        >
                                                                            Documentation
                                                                        </Link>
                                                                    </p>
                                                                }
                                                            >
                                                                <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                            </SimpleTooltip>
                                                        </label>
                                                        <ScopesInput
                                                            scopesString={overrideOauthScopes}
                                                            onChange={(newScopes) => {
                                                                setOverrideOauthScopes(newScopes);
                                                                return Promise.resolve();
                                                            }}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex flex-col gap-4">
                                                <label htmlFor="override_doc_url" className="flex gap-2 items-center text-sm font-medium">
                                                    Override end-user documentation URL
                                                    <SimpleTooltip
                                                        side="right"
                                                        align="center"
                                                        tooltipContent={
                                                            <p className="text-s">
                                                                Override the documentation URL we show on the Connect UI for this connection.
                                                                <br />
                                                                <Link
                                                                    to="https://nango.dev/docs/reference/api/connect/sessions/create#body-overrides-additional-properties-docs-connect"
                                                                    className="underline"
                                                                    target="_blank"
                                                                >
                                                                    Documentation
                                                                </Link>
                                                            </p>
                                                        }
                                                    >
                                                        <IconHelpCircle stroke={1} size={16} className="text-grayscale-500" />
                                                    </SimpleTooltip>
                                                </label>
                                                <Input
                                                    id="override_doc_url"
                                                    placeholder="https://example.com/docs"
                                                    value={overrideDocUrl}
                                                    onChange={(e) => setOverrideDocUrl(e.target.value)}
                                                    aria-invalid={!!errors.overrideDocUrl}
                                                />
                                                <ErrorMessage message={errors.overrideDocUrl?.[0]} />
                                            </div>
                                        </div>
                                    </CardContent>
                                </CollapsibleContent>
                            </Collapsible>
                        </Card>
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
