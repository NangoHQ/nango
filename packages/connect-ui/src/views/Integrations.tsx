import { IconArrowLeft } from '@tabler/icons-react';
import { QueryErrorResetBoundary, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { ErrorFallback } from '@/components/ErrorFallback';
import { Button } from '@/components/ui/button';
import { getIntegrations } from '@/lib/api';

export const Integrations: React.FC = () => {
    return (
        <div className="p-10">
            <header className="flex flex-col gap-8">
                <div className="flex justify-between">
                    <Button variant={'transparent'}>
                        <IconArrowLeft /> Back
                    </Button>
                    <Button variant={'transparent'}>Close</Button>
                </div>
                <div className="flex flex-col gap-5 text-center">
                    <h1 className="font-semibold text-xl text-dark-800">Select Integration</h1>
                    <p className="text-dark-500">Please select an API integration from the list below.</p>
                </div>
            </header>
            <main className="pt-5">
                <QueryErrorResetBoundary>
                    {({ reset }) => (
                        <ErrorBoundary fallbackRender={ErrorFallback} onReset={reset}>
                            <Suspense fallback={<div>loading</div>}>
                                <IntegrationsList />
                            </Suspense>
                        </ErrorBoundary>
                    )}
                </QueryErrorResetBoundary>
            </main>
        </div>
    );
};

const IntegrationsList: React.FC = () => {
    const { data } = useSuspenseQuery({ queryKey: ['integrations'], queryFn: getIntegrations });

    return (
        <div className="flex flex-col">
            {data.data.map((integration) => {
                return (
                    <div key={integration.unique_key} className="flex justify-between border-b py-5 px-5">
                        <div className="flex gap-3 items-center">
                            <div className="w-[50px] h-[50px] bg-white rounded-xl shadow p-2.5">
                                <img src={integration.logo} />
                            </div>
                            <div className="text-zinc-900">{integration.provider}</div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
