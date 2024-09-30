import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError } from '@nangohq/frontend';
import { IconArrowLeft, IconCircleCheckFilled, IconExclamationCircle, IconExclamationCircleFilled, IconX } from '@tabler/icons-react';
import { Link, Navigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { AuthResult } from '@nangohq/frontend';
import type { AuthModeType } from '@nangohq/types';

import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { triggerClose, triggerConnection } from '@/lib/events';
import { nango } from '@/lib/nango';
import { useGlobal } from '@/lib/store';
import { jsonSchemaToZod } from '@/lib/utils';

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
    OAUTH2_CC: z.object({}),
    TABLEAU: z.object({
        pat_name: z.string().min(1),
        pat_secret: z.string().min(1),
        content_url: z.string().min(1)
    }),
    TBA: z.object({
        oauth_client_id_override: z.string().min(1),
        oauth_client_secret_override: z.string().min(1),
        token_id: z.string().min(1),
        token_secret: z.string().min(1)
    }),
    CUSTOM: z.object({})
};

export const Go: React.FC = () => {
    const { provider, integration, setIsDirty } = useGlobal();

    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AuthResult>();
    const [error, setError] = useState<string | null>(null);
    const [connectionFailed, setConnectionFailed] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-assignment
    const authMode = provider?.auth_mode;

    useEffect(() => {
        // on unmount always clear popup and state
        return () => {
            nango.clear();
        };
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { resolver, hasField } = useMemo<{ resolver: Resolver<any>; hasField: boolean }>(() => {
        if (!provider) {
            return { hasField: true, resolver: () => ({ values: {}, errors: {} }) };
        }

        const authMode = provider.auth_mode;
        const baseForm = formSchema[authMode];

        // Modify base form with credentials specific
        for (const [name, schema] of Object.entries(provider.credentials || [])) {
            baseForm.shape[name] = jsonSchemaToZod(schema);
        }

        // Append connectionConfig object
        const additionalFields: z.ZodRawShape = {};
        for (const [name, schema] of Object.entries(provider.connection_config || [])) {
            additionalFields[name] = jsonSchemaToZod(schema);
        }

        // Only add objects if they have something otherwise it breaks react-form
        const fields = z.object({
            ...(Object.keys(baseForm.shape).length > 0 ? { credentials: baseForm } : {}),
            ...(Object.keys(additionalFields).length > 0 ? { params: z.object(additionalFields) } : {})
        });

        const hasField = Object.keys(fields.shape).length > 0;
        const resolver = zodResolver(fields);
        return { hasField, resolver };
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
    }, [isDirty]);
    useEffect(() => {
        if (result) {
            setIsDirty(false);
        }
    }, [result]);

    const onSubmit = useCallback(
        async (values: z.infer<(typeof formSchema)[AuthModeType]>) => {
            if (!integration || loading || !provider) {
                return;
            }

            setLoading(true);
            setError(null);
            // we don't care if it was already opened
            nango.clear();

            try {
                const res =
                    provider.auth_mode === 'NONE'
                        ? await nango.create(integration.unique_key, { ...values })
                        : await nango.auth(integration.unique_key, { ...values, detectClosedAuthWindow: true });
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
        [integration, loading]
    );

    useEffect(() => {
        if (hasField) {
            return;
        }

        // Auto submit when no fields are required (e.g: oauth2)
        void onSubmit({});
    }, []);

    if (!provider || !integration) {
        // typescript pleasing or if we enter the URL directly
        return <Navigate to="/" />;
    }

    if (result) {
        return (
            <Layout>
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
            </Layout>
        );
    }

    if (connectionFailed) {
        return (
            <Layout>
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
                        Try Again
                    </Button>
                </main>
            </Layout>
        );
    }

    return (
        <Layout>
            <header className="flex flex-col gap-8 p-10">
                <div className="flex justify-between">
                    <Link to="/" onClick={() => setIsDirty(false)}>
                        <Button className="gap-1" title="Back to integrations list" variant={'transparent'}>
                            <IconArrowLeft stroke={1} /> back
                        </Button>
                    </Link>
                    <Button size={'icon'} title="Close UI" variant={'transparent'} onClick={() => triggerClose()}>
                        <IconX stroke={1} />
                    </Button>
                </div>
                <div className="flex flex-col gap-5 items-center">
                    <div className="w-[70px] h-[70px] bg-white transition-colors rounded-xl shadow-card p-2.5 group-hover:bg-dark-100">
                        <img src={integration.logo} />
                    </div>
                    <h1 className="font-semibold text-xl text-dark-800">Link {provider.display_name} Account</h1>
                    <p className="text-dark-500">
                        Stuck?{' '}
                        <Link className="underline text-dark-800" target="_blank" to={provider.docs}>
                            View connection guide
                        </Link>
                    </p>
                </div>
            </header>
            <main className="h-full overflow-auto p-10 pt-1">
                <Form {...form}>
                    <form className="flex flex-col gap-4 justify-between grow min-h-full" onSubmit={form.handleSubmit(onSubmit)}>
                        {hasField && (
                            <div className="flex flex-col gap-8 p-7 border border-dark-300 rounded-md">
                                {authMode === 'API_KEY' && (
                                    <FormField
                                        control={form.control}
                                        name="credentials.apiKey"
                                        render={({ field }) => {
                                            const def = provider.credentials?.apiKey;
                                            return (
                                                <FormItem>
                                                    <div>
                                                        <FormLabel>{def?.title || 'API Key'}</FormLabel>
                                                        <FormDescription>{def?.description}</FormDescription>
                                                    </div>
                                                    <div>
                                                        <FormControl>
                                                            <Input placeholder={def?.example || 'Your API Key'} {...field} autoComplete="off" type="password" />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </div>
                                                </FormItem>
                                            );
                                        }}
                                    />
                                )}
                                {authMode === 'BASIC' && (
                                    <>
                                        <FormField
                                            control={form.control}
                                            name="credentials.username"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>User Name</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your user name" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="credentials.password"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>Password</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your password" {...field} autoComplete="off" type="password" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    </>
                                )}
                                {authMode === 'TABLEAU' && (
                                    <>
                                        <FormField
                                            control={form.control}
                                            name="credentials.pat_name"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>Personal App Token</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your PAT" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="credentials.pat_secret"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>Personal App Token Secret</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your PAT Secret" {...field} autoComplete="off" type="password" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="credentials.content_url"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>Content URL</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your content URL" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    </>
                                )}
                                {authMode === 'TBA' && (
                                    <>
                                        <FormField
                                            control={form.control}
                                            name="credentials.oauth_client_id_override"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>OAuth Client ID</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your OAuth Client ID" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="credentials.oauth_client_secret_override"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>OAuth Client Secret</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your OAuth Client Secret" {...field} autoComplete="off" type="password" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="credentials.token_id"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>Token ID</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your Token ID" {...field} />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="credentials.token_secret"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem>
                                                        <div>
                                                            <FormLabel>Token Secret</FormLabel>
                                                        </div>
                                                        <div>
                                                            <FormControl>
                                                                <Input placeholder="Your Token Secret" {...field} autoComplete="off" type="password" />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </div>
                                                    </FormItem>
                                                );
                                            }}
                                        />
                                    </>
                                )}

                                {provider.connection_config &&
                                    Object.entries(provider.connection_config).map(([key, schema]) => {
                                        return (
                                            <FormField
                                                key={key}
                                                control={form.control}
                                                name={`params.${key}`}
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem>
                                                            <div>
                                                                <FormLabel>{schema.title}</FormLabel>
                                                                {schema.description && <FormDescription>{schema.description}</FormDescription>}
                                                            </div>
                                                            <div>
                                                                <FormControl>
                                                                    <Input placeholder={schema.example || schema.title} {...field} autoComplete="off" />
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
                        {!hasField && <div className="text-sm text-dark-500 w-full text-center">{loading && 'A popup is opened...'}</div>}
                        <div className="flex flex-col gap-4">
                            {error && (
                                <div className="border border-red-base bg-red-base-35 text-red-base flex items-center py-1 px-4 rounded-md gap-2">
                                    <IconExclamationCircle size={20} stroke={1} /> {error}
                                </div>
                            )}
                            <Button
                                className="w-full"
                                disabled={!form.formState.isValid || Object.keys(form.formState.errors).length > 0}
                                loading={loading}
                                size={'lg'}
                                type="submit"
                            >
                                {error ? 'Try Again' : 'Connect'}
                            </Button>
                        </div>
                    </form>
                </Form>
            </main>
        </Layout>
    );
};
