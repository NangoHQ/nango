/// <reference types="vite-plugin-svgr/client" />
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, CircleAlert } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useEffectOnce } from 'react-use';

import NoIntegrationGif from '@/assets/no-integrations.gif';
import { ErrorFallback } from '@/components/ErrorFallback';
import { HeaderButtons } from '@/components/HeaderButtons';
import { LoadingView } from '@/components/LoadingView';
import { Button } from '@/components/ui/button';
import { APIError, getIntegrations, getProvider } from '@/lib/api';
import { triggerClose } from '@/lib/events';
import { useI18n } from '@/lib/i18n';
import { useGlobal } from '@/lib/store';
import { telemetry } from '@/lib/telemetry';

import type { ApiPublicIntegration, GetPublicProvider } from '@nangohq/types';

export const IntegrationsList: React.FC = () => {
    return (
        <QueryErrorResetBoundary>
            {({ reset }) => (
                <ErrorBoundary fallbackRender={ErrorFallback} onReset={reset}>
                    <Suspense fallback={<LoadingView />}>
                        <Integrations />
                    </Suspense>
                </ErrorBoundary>
            )}
        </QueryErrorResetBoundary>
    );
};

const Integrations: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useI18n();
    const store = useGlobal();
    const { data } = useSuspenseQuery({ queryKey: ['integrations'], queryFn: getIntegrations });

    const isSingleIntegration = data.data.length === 1 && store.session?.allowed_integrations?.length === 1;
    useEffect(() => {
        async function call() {
            const integration = data.data[0];
            const provider = await getProvider({ provider: integration.provider });
            store.set(provider.data, integration);
            await navigate({ to: '/go' });
        }
        if (isSingleIntegration) {
            store.setIsSingleIntegration(true);
            void call();
        }
    }, [data, store.session]);

    useEffectOnce(() => {
        if (isSingleIntegration) {
            return;
        }
        telemetry('view:list');
    });

    const integrations = useMemo<ApiPublicIntegration[]>(() => {
        const list: ApiPublicIntegration[] = [];
        for (const integration of data.data) {
            list.push({
                ...integration,
                display_name: integration.display_name
            });
        }
        return list;
    }, [data]);

    if (data.data.length <= 0) {
        return (
            <>
                <HeaderButtons />
                <main className="flex-1 flex flex-col gap-10 justify-center h-full">
                    <div className="flex flex-col items-center gap-5 w-full text-center">
                        <img alt="No integrations" className="w-[100px]" src={NoIntegrationGif} />
                        <h1 className="text-xl font-semibold text-primary">{t('integrationsList.noIntegrations')}</h1>
                        <p className="text-secondary">{t('integrationsList.noIntegrationsDescription')}</p>
                    </div>

                    <Button className="w-full" title={t('common.close')} onClick={() => triggerClose('click:close')}>
                        {t('common.close')}
                    </Button>
                </main>
            </>
        );
    }

    if (isSingleIntegration) {
        return <LoadingView />;
    }

    return (
        <>
            <HeaderButtons className="mb-5" />
            <main className="flex flex-col gap-7 h-full">
                <div className="flex flex-col gap-7 text-center">
                    <h1 className="font-semibold text-xl text-primary">{t('integrationsList.title')}</h1>
                    <p className="text-secondary">{t('integrationsList.description')}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                    {integrations.map((integration) => {
                        return <Integration key={integration.unique_key} integration={integration} />;
                    })}
                </div>
            </main>
        </>
    );
};

const Integration: React.FC<{ integration: ApiPublicIntegration }> = ({ integration }) => {
    const store = useGlobal();
    const navigate = useNavigate();
    const { t } = useI18n();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function triggerAuth() {
        setLoading(true);

        let provider: GetPublicProvider['Success'] | undefined;
        try {
            provider = await getProvider({ provider: integration.provider });
        } catch (err) {
            if (err instanceof APIError) {
                setError(() => {
                    // Trick to catch async error in the global state
                    throw err;
                });
                return;
            }
            setError(t('integrationsList.error'));
            setLoading(false);
            return;
        }

        telemetry('click:integration', { integration: integration.unique_key });
        store.set(provider.data, integration);
        setLoading(false);
        await navigate({ to: '/go' });
    }

    const onClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (loading) {
            return;
        }

        void triggerAuth();
    };

    const connectToLabel = t('integrationsList.connectTo', { provider: integration.provider });

    return (
        <div
            className="group flex flex-col gap-3 p-5 bg-sub-surface hover:bg-subtle focus:bg-subtle"
            role="button"
            tabIndex={0}
            title={connectToLabel}
            onClick={onClick}
        >
            <div className=" flex justify-between items-center">
                <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 bg-white transition-colors rounded-sm p-1.5 group-hover:bg-dark-100">
                        <img alt={`${integration.display_name} logo`} src={integration.logo} />
                    </div>
                    <div className="text-primary">{integration.display_name}</div>
                </div>
                <ArrowRight className="w-5 h-5 text-tertiary group-hover:text-primary" />
            </div>
            {error && (
                <div className="py-2 px-4 border border-error bg-red-100 text-error text-sm flex items-center rounded-sm gap-2">
                    <CircleAlert className="w-5 h-5" strokeWidth={1.5} /> {error} Error obtaining the provider.
                </div>
            )}
        </div>
    );
};
