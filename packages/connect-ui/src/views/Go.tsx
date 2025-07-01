import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowLeft, IconCircleCheckFilled, IconExclamationCircle, IconExclamationCircleFilled, IconInfoCircle, IconX } from '@tabler/icons-react';
import { Link, Navigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMount } from 'react-use';
import { z } from 'zod';

import { AuthError } from '@nangohq/frontend';

import { CustomInput } from '@/components/CustomInput';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { triggerClose, triggerConnection } from '@/lib/events';
import { useI18n } from '@/lib/i18n';
import { useNango } from '@/lib/nango';
import { useGlobal } from '@/lib/store';
import { telemetry } from '@/lib/telemetry';
import { cn, jsonSchemaToZod } from '@/lib/utils';

import type { AuthResult } from '@nangohq/frontend';
import type { AuthModeType } from '@nangohq/types';
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
    JWT: z.object({
        // JWT is custom every time
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
    const { provider, integration, session, isSingleIntegration, detectClosedAuthWindow, setIsDirty } = useGlobal();
    const nango = useNango();
    const { t } = useI18n();

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuthResult>();
    const [error, setError] = useState<string | null>(null);
    const [connectionFailed, setConnectionFailed] = useState(false);

    const preconfigured = session && integration ? session.integrations_config_defaults?.[integration.unique_key]?.connection_config || {} : {};

    useMount(() => {
        if (integration) {
            telemetry('view:integration', { integration: integration.unique_key });
        }
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
            if (preconfigured[name] ?? schema.hidden) {
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
            telemetry('view:success');
            setIsDirty(false);
        }
    }, [result, setIsDirty]);
    useEffect(() => {
        if (connectionFailed) {
            telemetry('view:credentials_error');
        }
    }, [connectionFailed]);

    const onSubmit = useCallback(
        async (values: z.infer<(typeof formSchema)[AuthModeType]>) => {
            if (!integration || loading || !provider || !nango) {
                return;
            }

            telemetry('click:connect');
            setLoading(detectClosedAuthWindow);
            setError(null);
            // we don't care if it was already opened
            nango.clear();

            try {
                let res: AuthResult;
                // Legacy stuff because types were mixed together inappropriately
                if (provider.auth_mode === 'NONE') {
                    res = await nango.create(integration.unique_key, { ...values });
                } else if (
                    (provider.auth_mode === 'OAUTH2' && !provider.installation) ||
                    provider.auth_mode === 'OAUTH1' ||
                    provider.auth_mode === 'CUSTOM' ||
                    provider.auth_mode === 'APP'
                ) {
                    res = await nango.auth(integration.unique_key, {
                        ...values,
                        detectClosedAuthWindow
                    });
                } else {
                    res = await nango.auth(integration.unique_key, {
                        params: values['params'] || {},
                        credentials: { ...values['credentials'], type: provider.auth_mode },
                        detectClosedAuthWindow,
                        ...(provider.installation && { installation: provider.installation })
                    });
                }
                setResult(res);
                triggerConnection(res);
            } catch (err) {
                if (err instanceof AuthError) {
                    if (err.type === 'blocked_by_browser') {
                        telemetry('popup:blocked_by_browser');
                        setError(t('go.popupBlocked'));
                        return;
                    } else if (err.type === 'window_closed') {
                        telemetry('popup:closed_early');
                        setError(t('go.popupClosed'));
                        return;
                    } else if (err.type === 'connection_test_failed') {
                        setConnectionFailed(true);
                        setError(t('go.invalidCredentials', { provider: provider.display_name }));
                        return;
                    } else if (err.type === 'resource_capped') {
                        setConnectionFailed(true);
                        setError(t('go.resourceCapped'));
                        return;
                    }
                }

                setConnectionFailed(true);
            } finally {
                setLoading(false);
            }
        },
        [provider, integration, loading, nango, t, detectClosedAuthWindow]
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
                    <h2 className="text-xl font-semibold">{t('go.success')}</h2>
                    <p className="text-dark-500">{t('go.successMessage', { provider: provider.name })}</p>
                </div>
                <Button className="w-full" loading={loading} size={'lg'} onClick={() => triggerClose('click:finish')}>
                    {t('common.finish')}
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
                    <h2 className="text-xl font-semibold">{t('go.connectionFailed')}</h2>
                    {error ? <p className="text-dark-500 text-center w-[80%]">{error}</p> : <p>{t('go.tryAgain')}</p>}
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
                    {t('common.back')}
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
                            <Button className="gap-1" title={t('go.backToList')} variant={'transparent'}>
                                <IconArrowLeft stroke={1} /> {t('common.back')}
                            </Button>
                        </Link>
                    ) : (
                        <div></div>
                    )}
                    <Button size={'icon'} title={t('common.close')} variant={'transparent'} onClick={() => triggerClose('click:close')}>
                        <IconX stroke={1} />
                    </Button>
                </div>
                <div className="flex flex-col gap-5 items-center pt-10">
                    <div className="w-[70px] h-[70px] bg-white transition-colors rounded-xl shadow-card p-2.5 group-hover:bg-dark-100">
                        <img src={integration.logo} />
                    </div>
                    <h1 className="font-semibold text-xl text-dark-800">{t('go.linkAccount', { provider: provider.display_name })}</h1>
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
                                    const isPreconfigured = typeof preconfigured[key] !== 'undefined';
                                    const isOptional = definition && 'optional' in definition && definition.optional === true;

                                    return (
                                        <FormField
                                            key={name}
                                            control={form.control}
                                            defaultValue={isPreconfigured ? preconfigured[key] : (definition?.default_value ?? '')}
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
                                                                    <Link
                                                                        target="_blank"
                                                                        to={`${provider.docs_connect}${definition.doc_section}`}
                                                                        onClick={() => telemetry('click:doc_section')}
                                                                    >
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
                                    {t('go.willConnect', { provider: provider.display_name })}
                                    {provider.auth_mode === 'OAUTH2' && ` ${t('go.popupWarning')}`}
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
                                    {t('go.invalidPreconfigured')}
                                </div>
                            )}
                            {provider.docs_connect && (
                                <p className="text-dark-500 text-center">
                                    {t('common.needHelp')}{' '}
                                    <Link className="underline text-dark-800" target="_blank" to={provider.docs_connect} onClick={() => telemetry('click:doc')}>
                                        {t('common.viewGuide')}
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
                                {error ? t('common.tryAgain') : loading ? t('common.connecting') : t('go.connect')}
                            </Button>
                        </div>
                    </form>
                </Form>
            </main>
        </>
    );
};
