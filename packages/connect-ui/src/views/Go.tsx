import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError } from '@nangohq/frontend';
import { IconArrowLeft, IconCircleCheckFilled, IconExclamationCircle, IconExclamationCircleFilled, IconInfoCircle, IconX } from '@tabler/icons-react';
import { Link, Navigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useMount } from 'react-use';
import { z } from 'zod';

import type { AuthResult } from '@nangohq/frontend';
import type { AuthModeType } from '@nangohq/types';

import { CustomInput } from '@/components/CustomInput';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { triggerClose, triggerConnection } from '@/lib/events';
import { useNango } from '@/lib/nango';
import { useGlobal } from '@/lib/store';
import { cn, jsonSchemaToZod } from '@/lib/utils';

import type { Resolver } from 'react-hook-form';

const formSchema: Record<AuthModeType, z.AnyZodObject> = {
    API_KEY: z.object({
        apiKey: z.string().min(1)
    }),
    BASIC: z.object({
        username: z.string().min(1),
        password: z.string().min(1)
    }),
    APP: z.object({}),
    APP_STORE: z.object({}),
    NONE: z.object({}),
    OAUTH1: z.object({}),
    OAUTH2: z.object({}),
    OAUTH2_CC: z.object({
        client_id: z.string().min(1),
        client_secret: z.string().min(1)
    }),
    TABLEAU: z.object({
        pat_name: z.string().min(1),
        pat_secret: z.string().min(1),
        content_url: z.string().min(1)
    }),
    JWT: z.object({
        privateKeyId: z.string().optional(),
        issuerId: z.string().optional(),
        privateKey: z.union([
            z.object({
                id: z.string(),
                secret: z.string()
            }),
            z.string()
        ])
    }),
    TWO_STEP: z.object({
        // TWO_STEP is custom every time
    }),
    TBA: z.object({
        oauth_client_id_override: z.string().min(1),
        oauth_client_secret_override: z.string().min(1),
        token_id: z.string().min(1),
        token_secret: z.string().min(1)
    }),
    BILL: z.object({
        username: z.string().min(1),
        password: z.string().min(1),
        organization_id: z.string().min(1),
        dev_key: z.string().min(1)
    }),
    SIGNATURE: z.object({
        username: z.string().min(1),
        password: z.string().min(1)
    }),
    CUSTOM: z.object({})
};

const defaultConfiguration: Record<string, { secret: boolean; title: string; example: string }> = {
    'credentials.apiKey': { secret: true, title: 'API Key', example: 'Your API Key' },
    'credentials.username': { secret: false, title: 'User Name', example: 'Your user name' },
    'credentials.password': { secret: true, title: 'Password', example: 'Your password' },
    'credentials.pat_name': { secret: false, title: 'Personal App Token', example: 'Your PAT' },
    'credentials.pat_secret': { secret: true, title: 'Personal App Token Secret', example: 'Your PAT Secret' },
    'credentials.content_url': { secret: true, title: 'Content URL', example: 'Your content URL' },
    'credentials.client_id': { secret: false, title: 'Client ID', example: 'Your Client ID' },
    'credentials.client_secret': { secret: true, title: 'Client Secret', example: 'Your Client Secret' },
    'credentials.oauth_client_id_override': { secret: false, title: 'OAuth Client ID', example: 'Your OAuth Client ID' },
    'credentials.oauth_client_secret_override': { secret: true, title: 'OAuth Client Secret', example: 'Your OAuth Client Secret' },
    'credentials.token_id': { secret: true, title: 'Token ID', example: 'Your Token ID' },
    'credentials.token_secret': { secret: true, title: 'Token Secret', example: 'Token Secret' },
    'credentials.organization_id': { secret: false, title: 'Organization ID', example: 'Your Organization ID' },
    'credentials.dev_key': { secret: true, title: 'Developer Key', example: 'Your Developer Key' }
};

export const Go: React.FC = () => {
    const { provider, integration, session, isSingleIntegration, setIsDirty } = useGlobal();
    const nango = useNango();

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuthResult>();
    const [error, setError] = useState<string | null>(null);
    const [connectionFailed, setConnectionFailed] = useState(false);

    const preconfigured = session && integration ? session.integrations_config_defaults?.[integration.unique_key]?.connection_config || {} : {};

    useMount(() => {
        // on unmount always clear popup and state
        return () => {
            nango?.clear();
        };
    });

    const { resolver, shouldAutoTrigger, orderedFields } = useMemo<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: Resolver<any>;
        shouldAutoTrigger: boolean;
        orderedFields: [string, number][];
    }>(() => {
        if (!provider) {
            return { shouldAutoTrigger: false, resolver: () => ({ values: {}, errors: {} }), orderedFields: [] };
        }

        const baseForm = formSchema[provider.auth_mode];

        // To order fields we use incremented int starting high because we don't know yet which fields will be sorted
        // It's a lazy algorithm that works most of the time
        const orderedFields: Record<string, number> = {};
        let hiddenFields = 0;
        let order = 99;

        // Base credentials are usually the first in the list so we start here
        for (const name of Object.keys(baseForm.shape)) {
            order += 1;
            orderedFields[`credentials.${name}`] = order;
        }

        // Modify base form with credentials specific
        for (const [name, schema] of Object.entries(provider.credentials || [])) {
            baseForm.shape[name] = jsonSchemaToZod(schema);

            // In case the field only exists in provider.yaml (TWO_STEP)
            const fullName = `credentials.${name}`;
            if (!orderedFields[fullName]) {
                order += 1;
                orderedFields[fullName] = order;
            }
        }

        // Append connectionConfig object
        const additionalFields: z.ZodRawShape = {};
        for (const [name, schema] of Object.entries(provider.connection_config || [])) {
            if (schema.automated) {
                continue;
            }

            additionalFields[name] = jsonSchemaToZod(schema);

            if (schema.order) {
                // If there is an order prop, it will goes before credentials
                orderedFields[`params.${name}`] = schema.order;
            } else {
                // Otherwise it's after
                order += 1;
                orderedFields[`params.${name}`] = order;
            }
            if (preconfigured[name] || schema.hidden) {
                hiddenFields += 1;
            }
        }

        // Only add objects if they have something otherwise it breaks react-form
        const fields = z.object({
            ...(Object.keys(baseForm.shape).length > 0 ? { credentials: baseForm } : {}),
            ...(Object.keys(additionalFields).length > 0 ? { params: z.object(additionalFields) } : {})
        });

        const fieldCount =
            (fields.shape.credentials ? Object.keys(fields.shape.credentials.shape).length : 0) +
            (fields.shape.params ? Object.keys(fields.shape.params?.shape).length : 0);
        const resolver = zodResolver(fields);
        return {
            shouldAutoTrigger: fieldCount - hiddenFields <= 0,
            resolver,
            orderedFields: Object.entries(orderedFields).sort((a, b) => (a[1] < b[1] ? -1 : 1))
        };
    }, [provider]);

    const form = useForm<z.infer<(typeof formSchema)['API_KEY']>>({
        resolver: resolver,
        mode: 'onChange',
        reValidateMode: 'onChange'
    });
    const isDirty = Object.keys(form.formState.dirtyFields).length;

    useEffect(() => {
        if (isDirty) {
            setIsDirty(true);
        }
    }, [isDirty, setIsDirty]);
    useEffect(() => {
        if (result) {
            setIsDirty(false);
        }
    }, [result, setIsDirty]);

    const onSubmit = useCallback(
        async (values: z.infer<(typeof formSchema)[AuthModeType]>) => {
            if (!integration || loading || !provider || !nango) {
                return;
            }

            setLoading(true);
            setError(null);
            // we don't care if it was already opened
            nango.clear();

            try {
                let res: AuthResult;
                // Legacy stuff because types were mixed together inappropriately
                if (provider.auth_mode === 'NONE') {
                    res = await nango.create(integration.unique_key, { ...values });
                } else if (provider.auth_mode === 'OAUTH2' || provider.auth_mode === 'OAUTH1' || provider.auth_mode === 'CUSTOM') {
                    res = await nango.auth(integration.unique_key, {
                        ...values,
                        detectClosedAuthWindow: true
                    });
                } else {
                    res = await nango.auth(integration.unique_key, {
                        params: values['params'] || {},
                        credentials: { ...values['credentials'], type: provider.auth_mode },
                        detectClosedAuthWindow: true
                    });
                }
                setResult(res);
                triggerConnection(res);
            } catch (err) {
                if (err instanceof AuthError) {
                    if (err.type === 'blocked_by_browser') {
                        setError('Auth pop-up blocked by your browser, please allow pop-ups to open');
                        return;
                    } else if (err.type === 'windowClosed') {
                        setError('The auth pop-up was closed before the end of the process, please try again');
                        return;
                    } else if (err.type === 'connection_test_failed') {
                        setConnectionFailed(true);
                        setError(`${provider.display_name} did not validate your credentials. Please check the values and try again.`);
                        return;
                    }
                }

                setConnectionFailed(true);
            } finally {
                setLoading(false);
            }
        },
        [provider, integration, loading, nango]
    );

    if (!provider || !integration) {
        // typescript pleasing or if we enter the URL directly
        return <Navigate to="/" />;
    }

    if (result) {
        return (
            <main className="h-full overflow-auto p-10 pt-1 flex flex-col justify-between ">
                <div></div>
                <div className="flex flex-col items-center gap-5">
                    <IconCircleCheckFilled className="text-green-base" size={44} />
                    <h2 className="text-xl font-semibold">Success!</h2>
                    <p className="text-dark-500">You&apos;ve successfully set up your {provider.name} integration</p>
                </div>
                <Button className="w-full" loading={loading} size={'lg'} onClick={() => triggerClose()}>
                    Finish
                </Button>
            </main>
        );
    }

    if (connectionFailed) {
        return (
            <main className="h-full overflow-auto p-10 pt-1 flex flex-col justify-between ">
                <div></div>
                <div className="flex flex-col items-center gap-5">
                    <IconExclamationCircleFilled className="text-dark-800" size={44} />
                    <h2 className="text-xl font-semibold">Connection failed</h2>
                    {error ? <p className="text-dark-500 text-center w-[80%]">{error}</p> : <p>Please try again</p>}
                </div>
                <Button
                    className="w-full"
                    loading={loading}
                    size={'lg'}
                    onClick={() => {
                        setConnectionFailed(false);
                        setError(null);
                    }}
                >
                    Back
                </Button>
            </main>
        );
    }

    return (
        <>
            <header className="relative m-10">
                <div className="absolute top-0 left-0 w-full flex justify-between">
                    {!isSingleIntegration ? (
                        <Link to="/" onClick={() => setIsDirty(false)}>
                            <Button className="gap-1" title="Back to integrations list" variant={'transparent'}>
                                <IconArrowLeft stroke={1} /> back
                            </Button>
                        </Link>
                    ) : (
                        <div></div>
                    )}
                    <Button size={'icon'} title="Close UI" variant={'transparent'} onClick={() => triggerClose()}>
                        <IconX stroke={1} />
                    </Button>
                </div>
                <div className="flex flex-col gap-5 items-center pt-10">
                    <div className="w-[70px] h-[70px] bg-white transition-colors rounded-xl shadow-card p-2.5 group-hover:bg-dark-100">
                        <img src={integration.logo} />
                    </div>
                    <h1 className="font-semibold text-xl text-dark-800">Link {provider.display_name} Account</h1>
                </div>
            </header>
            <main className="h-full overflow-auto p-10 pt-1">
                <Form {...form}>
                    <form className="flex flex-col gap-4 justify-between grow min-h-full animate-in" onSubmit={form.handleSubmit(onSubmit)}>
                        {orderedFields.length > 0 && (
                            <div className={cn('flex flex-col gap-8 p-7 rounded-md', !shouldAutoTrigger && 'border border-dark-300')}>
                                {orderedFields.map(([name]) => {
                                    const [type, key] = name.split('.') as ['credentials' | 'params', string];

                                    const definition = provider[type === 'credentials' ? 'credentials' : 'connection_config']?.[key];
                                    // Not all fields have a definition in providers.yaml so we fallback to default
                                    const base = name in defaultConfiguration ? defaultConfiguration[name] : undefined;
                                    const isPreconfigured = preconfigured[key];
                                    const isOptional = definition && 'optional' in definition && definition.optional === true;

                                    return (
                                        <FormField
                                            key={name}
                                            control={form.control}
                                            defaultValue={isPreconfigured ?? definition?.default_value ?? ''}
                                            // disabled={Boolean(definition?.hidden)} DO NOT disable it breaks the form
                                            name={name}
                                            render={({ field }) => {
                                                return (
                                                    <FormItem className={cn(isPreconfigured || definition?.hidden || definition?.automated ? 'hidden' : null)}>
                                                        <div>
                                                            <div className="flex gap-2 items-center pb-1">
                                                                <FormLabel className="leading-5">
                                                                    {definition?.title || base?.title} {!isOptional && <span className="text-red-base">*</span>}
                                                                </FormLabel>
                                                                {isOptional && (
                                                                    <span className="bg-dark-300 rounded-lg px-2 py-0.5 text-xs text-dark-500">optional</span>
                                                                )}
                                                                {definition?.doc_section && (
                                                                    <Link target="_blank" to={`${provider.docs_connect}${definition.doc_section}`}>
                                                                        <IconInfoCircle size={16} />
                                                                    </Link>
                                                                )}
                                                            </div>
                                                            {definition?.description && <FormDescription>{definition.description}</FormDescription>}
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <CustomInput
                                                                    placeholder={definition?.example || definition?.title || base?.example}
                                                                    prefix={definition?.prefix}
                                                                    suffix={definition?.suffix}
                                                                    {...field}
                                                                    autoComplete="off"
                                                                    type={definition?.secret || base?.secret ? 'password' : 'text'}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}
                        {shouldAutoTrigger && (
                            <>
                                <div></div>
                                <div className="text-sm text-dark-500 w-full text-center -mt-20">
                                    {/* visual centering */}
                                    We will connect you to {provider.display_name}
                                    {provider.auth_mode === 'OAUTH2' && ". A popup will open, please make sure your browser doesn't block popups"}
                                </div>
                            </>
                        )}
                        <div className="flex flex-col gap-4">
                            {error && (
                                <div className="border border-red-base bg-red-base-35 text-red-base flex items-center py-1 px-4 rounded-md gap-2">
                                    <div>
                                        <IconExclamationCircle size={20} stroke={1} />
                                    </div>{' '}
                                    {error}
                                </div>
                            )}
                            {!error && shouldAutoTrigger && !form.formState.isValid && (
                                <div className="border border-red-base bg-red-base-35 text-red-base flex items-center py-1 px-4 rounded-md gap-2">
                                    <div>
                                        <IconExclamationCircle size={20} stroke={1} />
                                    </div>
                                    A pre-configured field set by the administrator is invalid, please reach out to the support
                                </div>
                            )}
                            {provider.docs_connect && (
                                <p className="text-dark-500 text-center">
                                    Need help?{' '}
                                    <Link className="underline text-dark-800" target="_blank" to={provider.docs_connect}>
                                        View connection guide
                                    </Link>
                                </p>
                            )}
                            <Button
                                className="w-full"
                                disabled={!form.formState.isValid || Object.keys(form.formState.errors).length > 0}
                                loading={loading}
                                size={'lg'}
                                type="submit"
                            >
                                {error ? 'Try Again' : loading ? 'Connecting...' : 'Connect'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </main>
        </>
    );
};
