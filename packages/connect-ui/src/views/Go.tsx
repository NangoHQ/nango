import { zodResolver } from '@hookform/resolvers/zod';
import { IconCircleCheckFilled, IconCircleXFilled, IconExternalLink, IconInfoCircle } from '@tabler/icons-react';
import { Link, Navigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMount } from 'react-use';
import * as z from 'zod';

import { AuthError } from '@nangohq/frontend';

import { CustomInput } from '@/components/CustomInput';
import { HeaderButtons } from '@/components/HeaderButtons';
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
import type { InputHTMLAttributes } from 'react';
import type { Resolver } from 'react-hook-form';

const formSchema: Record<AuthModeType, z.ZodObject> = {
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
        client_secret: z.string().min(1),
        client_certificate: z.string().min(1).optional(),
        client_private_key: z.string().min(1).optional()
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
    'credentials.client_certificate': { secret: true, title: 'Client Certificate', example: 'Your Client Certificate' },
    'credentials.client_private_key': { secret: true, title: 'Private Key', example: 'Your Private Key' },
    'credentials.oauth_client_id_override': { secret: false, title: 'OAuth Client ID', example: 'Your OAuth Client ID' },
    'credentials.oauth_client_secret_override': { secret: true, title: 'OAuth Client Secret', example: 'Your OAuth Client Secret' },
    'credentials.token_id': { secret: true, title: 'Token ID', example: 'Your Token ID' },
    'credentials.token_secret': { secret: true, title: 'Token Secret', example: 'Token Secret' },
    'credentials.organization_id': { secret: false, title: 'Organization ID', example: 'Your Organization ID' },
    'credentials.dev_key': { secret: true, title: 'Developer Key', example: 'Your Developer Key' }
};

export const Go: React.FC = () => {
    const { isPreview, provider, integration, session, isSingleIntegration, detectClosedAuthWindow, setIsDirty } = useGlobal();
    const nango = useNango();
    const { t } = useI18n();

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuthResult>();
    const [error, setError] = useState<string | null>(null);
    const [connectionFailed, setConnectionFailed] = useState(false);

    const preconfigured = session && integration ? session.integrations_config_defaults?.[integration.unique_key]?.connection_config || {} : {};

    const displayName = useMemo(() => {
        return integration?.display_name ?? provider?.display_name ?? '';
    }, [integration, provider]);

    const [docsConnectUrl, urlOverride] = useMemo(() => {
        if (!integration?.unique_key) return [null, false];
        const override = session?.overrides?.[integration?.unique_key]?.docs_connect;
        if (override) return [override, true];
        return [provider?.docs_connect, false];
    }, [provider, integration, session]);

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
            if ((name === 'client_certificate' || name === 'client_private_key') && provider.require_client_certificate !== true) {
                continue;
            }
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
            if (preconfigured[name] ?? schema.hidden) {
                hiddenFields += 1;
            }
        }

        // Append connectionConfig object
        const additionalFields: Record<string, z.ZodType> = {};
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
        async (v: Record<string, unknown>) => {
            if (isPreview || !integration || loading || !provider || !nango) {
                return;
            }

            const values = v as { credentials: Record<string, string>; params: Record<string, string> };

            telemetry('click:connect');
            setLoading(true);
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
                        credentials: { ...values['credentials'], type: provider.auth_mode } as Record<string, string>,
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
                        setError(t('go.invalidCredentials', { provider: displayName }));
                        return;
                    } else if (err.type === 'connection_validation_failed') {
                        setConnectionFailed(true);
                        setError(err.message || t('go.invalidCredentials', { provider: displayName }));
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
            <>
                <HeaderButtons />
                <main className="space-y-10">
                    <div className="flex flex-col gap-7 items-center">
                        <div className="relative w-16 h-16 p-2 rounded-sm shadow-md bg-white">
                            <img src={integration.logo} />
                            <div className="absolute -bottom-3.5 -right-3.5 w-7 h-7 p-1 rounded-full bg-green-300">
                                <IconCircleCheckFilled className="w-full h-full text-green-600" />
                            </div>
                        </div>
                        <h2 className="text-xl font-semibold text-primary-light dark:text-primary-dark">{t('go.success')}</h2>
                    </div>
                    <p className="text-center text-secondary-light dark:text-secondary-dark">{t('go.successMessage', { provider: provider.name })}</p>
                    <Button className="w-full" loading={loading} size={'lg'} onClick={() => triggerClose('click:finish')}>
                        {t('common.finish')}
                    </Button>
                </main>
            </>
        );
    }

    if (connectionFailed) {
        return (
            <>
                <HeaderButtons />
                <main className="flex flex-col items-center gap-10">
                    <div className="flex flex-col gap-7 items-center">
                        <div className="relative w-16 h-16 p-2 rounded-sm shadow-md bg-white">
                            <img src={integration.logo} />
                            <div className="absolute -bottom-3.5 -right-3.5 w-7 h-7 p-1 rounded-full bg-red-300">
                                <IconCircleXFilled className="w-full h-full text-red-700" />
                            </div>
                        </div>
                        <h2 className="text-xl font-semibold text-primary-light dark:text-primary-dark">{t('go.connectionFailed')}</h2>
                    </div>
                    <p className="text-secondary-light dark:text-secondary-dark text-center">{error || t('go.tryAgain')}</p>
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
            </>
        );
    }

    return (
        <>
            <HeaderButtons
                backLink={!isSingleIntegration ? '/integrations' : undefined}
                onClickBack={() => {
                    setIsDirty(false);
                }}
            />
            <main className="space-y-7">
                <div className="flex flex-col gap-7 items-center">
                    <div className="w-16 h-16 p-2 rounded-sm shadow-md bg-white">
                        <img src={integration.logo} />
                    </div>
                    <h1 className="font-semibold text-center text-xl text-primary-light dark:text-primary-dark">
                        {t('go.linkAccount', { provider: displayName })}
                    </h1>
                </div>

                <Form {...form}>
                    <form className="space-y-7" onSubmit={form.handleSubmit(onSubmit)}>
                        {orderedFields.length > 0 && (
                            <div className={cn('space-y-10')}>
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
                                                        <div className="space-y-2">
                                                            <div className="flex gap-2 items-center">
                                                                <FormLabel className="text-xs font-semibold text-primary-light dark:text-primary-dark">
                                                                    {definition?.title || base?.title}{' '}
                                                                    {!isOptional && <span className="text-red-700 dark:text-red-500">*</span>}
                                                                </FormLabel>
                                                                {isOptional && (
                                                                    <span className="bg-elevated-light dark:bg-elevated-dark rounded-lg px-2 py-0.5 text-xs text-text-muted">
                                                                        optional
                                                                    </span>
                                                                )}
                                                                {docsConnectUrl && (
                                                                    <Link
                                                                        target="_blank"
                                                                        to={`${docsConnectUrl}${urlOverride ? '' : `${definition?.doc_section}`}`}
                                                                        onClick={() => telemetry('click:doc_section')}
                                                                    >
                                                                        <IconInfoCircle className="w-4 h-4 text-secondary-light dark:text-secondary-dark" />
                                                                    </Link>
                                                                )}
                                                            </div>
                                                            {definition?.description && (
                                                                <FormDescription className="text-secondary-light dark:text-secondary-dark">
                                                                    {definition.description}
                                                                </FormDescription>
                                                            )}
                                                        </div>
                                                        <FormControl>
                                                            <CustomInput
                                                                placeholder={definition?.example || definition?.title || base?.example}
                                                                prefix={definition?.prefix}
                                                                suffix={definition?.suffix}
                                                                {...(field as InputHTMLAttributes<HTMLInputElement>)}
                                                                autoComplete="off"
                                                                type={definition?.secret || base?.secret ? 'password' : 'text'}
                                                            />
                                                        </FormControl>
                                                        <FormMessage className="p-0" />
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        )}

                        {shouldAutoTrigger && (
                            <div className="text-sm text-secondary-light dark:text-secondary-dark text-center">
                                {t('go.willConnect', { provider: displayName })}
                                {provider.auth_mode === 'OAUTH2' && ` ${t('go.popupWarning')}`}
                            </div>
                        )}

                        {error && (
                            <p className="text-sm text-secondary-light dark:text-secondary-dark text-center bg-elevated-light dark:bg-elevated-dark p-6 rounded-md">
                                {error}
                            </p>
                        )}

                        {!error && shouldAutoTrigger && !form.formState.isValid && (
                            <p className="text-sm text-secondary-light dark:text-secondary-dark text-center bg-elevated-light dark:bg-elevated-dark p-6 rounded-md">
                                {t('go.invalidPreconfigured')}
                            </p>
                        )}

                        <Button
                            className="w-full"
                            disabled={!form.formState.isValid || Object.keys(form.formState.errors).length > 0}
                            loading={loading}
                            type="submit"
                        >
                            {error ? t('common.tryAgain') : loading ? t('common.connecting') : t('go.connect')}
                        </Button>

                        {docsConnectUrl && (
                            <p className="text-secondary-light dark:text-secondary-dark text-center">
                                {t('common.needHelp')}{' '}
                                <Link
                                    className="underline text-primary-light dark:text-primary-dark"
                                    target="_blank"
                                    to={docsConnectUrl}
                                    onClick={() => telemetry('click:doc')}
                                >
                                    {t('common.viewGuide')}
                                </Link>{' '}
                                <IconExternalLink className="inline-block w-3.5 h-3.5 text-secondary-light dark:text-secondary-dark" stroke={2} />
                            </p>
                        )}
                    </form>
                </Form>
            </main>
        </>
    );
};
