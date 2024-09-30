/// <reference types="vite-plugin-svgr/client" />
import { IconArrowRight, IconExclamationCircle, IconX } from '@tabler/icons-react';
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Suspense, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import type { ApiPublicIntegration, GetPublicProvider } from '@nangohq/types';

import { ErrorFallback } from '@/components/ErrorFallback';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { getIntegrations, getProvider } from '@/lib/api';
import { triggerClose } from '@/lib/events';
import { useGlobal } from '@/lib/store';
import NoIntegrationSVG from '@/svg/nointegrations.svg?react';

export const IntegrationsList: React.FC = () => {
    return (
        <QueryErrorResetBoundary>
            {({ reset }) => (
                <ErrorBoundary fallbackRender={ErrorFallback} onReset={reset}>
                    <Suspense fallback={<div>loading</div>}>
                        <Integrations />
                    </Suspense>
                </ErrorBoundary>
            )}
        </QueryErrorResetBoundary>
    );
};

const Integrations: React.FC = () => {
    const { data } = useSuspenseQuery({ queryKey: ['integrations'], queryFn: getIntegrations });

    if (data.data.length <= 0) {
        return (
            <Layout>
                <main className="h-full overflow-auto m-9 p-1">
                    <div className="flex flex-col justify-between h-full">
                        <div></div>
                        <div className="flex flex-col items-center gap-5 w-full">
                            <NoIntegrationSVG />
                            <h1 className="text-xl font-semibold">No integration found.</h1>
                        </div>

                        <Button title="Close UI" onClick={() => triggerClose()}>
                            Close
                        </Button>
                    </div>
                </main>
            </Layout>
        );
    }
    return (
        <Layout>
            <header className="flex flex-col gap-4 p-10 ">
                <div className="flex justify-end">
                    <Button size={'icon'} title="Close UI" variant={'transparent'} onClick={() => triggerClose()}>
                        <IconX stroke={1} />
                    </Button>
                </div>
                <div className="flex flex-col gap-5 text-center">
                    <h1 className="font-semibold text-xl text-dark-800">Select Integration</h1>
                    <p className="text-dark-500">Please select an API integration from the list below.</p>
                </div>
            </header>
            <main className="h-full overflow-auto m-9 mt-1 p-1">
                <div className="flex flex-col">
                    {data.data.map((integration) => {
                        return <Integration key={integration.unique_key} integration={integration} />;
                    })}
                </div>
            </main>
        </Layout>
    );
};

const Integration: React.FC<{ integration: ApiPublicIntegration }> = ({ integration }) => {
    const store = useGlobal();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function triggerAuth() {
        setLoading(true);

        let provider: GetPublicProvider['Success'] | undefined;
        try {
            provider = await getProvider({ provider: integration.provider });
        } catch (err) {
            console.log(err);
            setError('An error occurred while loading configuration');
            setLoading(false);
            return;
        }

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

    return (
        <div
            className="group flex justify-between items-center border-b border-b-dark-100 py-5 px-5 transition-colors rounded-md ring-offset-white focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-1 focus-visible:outline-none hover:bg-dark-100 focus:bg-dark-100"
            role="button"
            tabIndex={0}
            title={`Connect to ${integration.provider}`}
            onClick={onClick}
        >
            <div className="flex gap-3 items-center">
                <div className="w-[50px] h-[50px] bg-white transition-colors rounded-xl shadow-card p-2.5 group-hover:bg-dark-100">
                    <img src={integration.logo} />
                </div>
                <div className="text-zinc-900">{integration.display_name}</div>
                {error && (
                    <div className="border border-red-base bg-red-base-35 text-red-base flex items-center py-1 px-4 rounded gap-2">
                        <IconExclamationCircle size={17} stroke={1} /> {error}
                    </div>
                )}
            </div>
            <div>
                <Button size={'icon'} title={`Connect to ${integration.provider}`} variant={'transparent'}>
                    <IconArrowRight stroke={1} />
                </Button>
            </div>
        </div>
    );
};
