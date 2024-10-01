import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import type { ConnectUIEventToken } from '@nangohq/frontend';

import { ErrorFallback } from '@/components/ErrorFallback';
import { Layout } from '@/components/Layout';
import { getConnectSession } from '@/lib/api';
import { triggerReady } from '@/lib/events';
import { useGlobal } from '@/lib/store';

export const Home: React.FC = () => {
    const navigate = useNavigate();
    const { sessionToken, session, setSession, setSessionToken } = useGlobal();

    const { data, error, isLoading } = useQuery({
        enabled: sessionToken !== null,
        queryKey: ['sessionToken'],
        queryFn: () => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return getConnectSession(sessionToken!);
        }
    });

    useEffect(() => {
        // Listen to parent
        // the parent will send the sessionToken through post message
        const listener: (this: Window, ev: MessageEvent) => void = (evt) => {
            if (!evt.data || !('type' in evt.data) || evt.data.type !== 'session_token') {
                return;
            }

            const data = evt.data as ConnectUIEventToken;
            setSessionToken(data.sessionToken);
        };
        window.addEventListener('message', listener, false);

        // Tell the parent we are ready to receive message
        triggerReady();

        const search = new URLSearchParams(window.location.search);
        const inUrl = search.get('session_token');
        if (inUrl) {
            setSessionToken(inUrl);
        }

        return () => {
            window.removeEventListener('message', listener, false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (data) {
            setSession(data.data);
            void navigate({ to: '/integrations' });
        }
    }, [data]);

    if (!sessionToken || isLoading || session) {
        return (
            <Layout>
                <div className="w-full h-full text-dark-400 flex items-center justify-center">Loading...</div>
            </Layout>
        );
    }

    if (error) {
        return <ErrorFallback />;
    }

    return <Layout>.</Layout>;
};
