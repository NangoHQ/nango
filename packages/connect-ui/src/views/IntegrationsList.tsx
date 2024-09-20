import { IconArrowLeft, IconArrowRight, IconX } from '@tabler/icons-react';
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import type { ApiPublicIntegration, GetPublicProvider } from '@nangohq/types';

import { ErrorFallback } from '@/components/ErrorFallback';
import { Button } from '@/components/ui/button';
import { getIntegrations, getProvider } from '@/lib/api';

export const IntegrationsList: React.FC = () => {
    return (
        <div className="h-screen overflow-hidden">
            <header className="flex flex-col gap-8 p-10 ">
                <div className="flex justify-between">
                    <Button variant={'transparent'} className="gap-1" title="Close UI">
                        <IconArrowLeft stroke={1} /> Back
                    </Button>
                    <Button variant={'transparent'} title="Close UI" size={'icon'}>
                        <IconX stroke={1} />
                    </Button>
                </div>
                <div className="flex flex-col gap-5 text-center">
                    <h1 className="font-semibold text-xl text-dark-800">Select Integration</h1>
                    <p className="text-dark-500">Please select an API integration from the list below.</p>
                </div>
            </header>
            <main className="h-full overflow-auto p-10 pt-1">
                <QueryErrorResetBoundary>
                    {({ reset }) => (
                        <ErrorBoundary fallbackRender={ErrorFallback} onReset={reset}>
                            <Suspense fallback={<div>loading</div>}>
                                <Integrations />
                            </Suspense>
                        </ErrorBoundary>
                    )}
                </QueryErrorResetBoundary>
            </main>
        </div>
    );
};

const Integrations: React.FC = () => {
    const { data } = useSuspenseQuery({ queryKey: ['integrations'], queryFn: getIntegrations });

    return (
        <div className="flex flex-col">
            {data.data.map((integration) => {
                return <Integration key={integration.unique_key} integration={integration} />;
            })}
        </div>
    );
};

const Integration: React.FC<{ integration: ApiPublicIntegration }> = ({ integration }) => {
    const [loading, setLoading] = useState(false);

    async function triggerAuth() {
        setLoading(true);
        let provider: GetPublicProvider['Success'] | undefined;
        try {
            provider = await getProvider({ provider: integration.provider });
        } catch (err) {
            console.log(err); // TODO: handle this
        }

        console.log('got provider', provider);

        setLoading(false);
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
            className="flex justify-between items-center border-b py-5 px-5 rounded-md ring-offset-white focus-visible:ring-neutral-950 focus-visible:ring-offset-2 focus-visible:ring-1 focus-visible:outline-none"
            role="button"
            tabIndex={0}
            title={`Connect to ${integration.provider}`}
            onClick={onClick}
        >
            <div className="flex gap-3 items-center">
                <div className="w-[50px] h-[50px] bg-white rounded-xl shadow-card p-2.5">
                    <img src={integration.logo} />
                </div>
                <div className="text-zinc-900">{integration.provider}</div>
            </div>
            <div>
                <Button variant={'transparent'} title={`Connect to ${integration.provider}`} size={'icon'}>
                    <IconArrowRight stroke={1} />
                </Button>
            </div>
        </div>
    );
};
