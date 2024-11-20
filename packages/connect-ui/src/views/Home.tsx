import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSearchParam } from 'react-use';

import type { ConnectUIEventToken } from '@nangohq/frontend';

import { ErrorFallback } from '@/components/ErrorFallback';
import { LoadingView } from '@/components/LoadingView';
import { getConnectSession } from '@/lib/api';
import { triggerReady } from '@/lib/events';
import { useGlobal } from '@/lib/store';

export const Home: React.FC = () => {
    const navigate = useNavigate();
    const { sessionToken, setApiURL, setSession, setSessionToken } = useGlobal();

    const { data, error } = useQuery({ enabled: sessionToken !== null, queryKey: ['sessionToken'], queryFn: getConnectSession });
    const apiURL = useSearchParam('apiURL');

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
        if (apiURL) setApiURL(apiURL);
    }, [apiURL]);

    useEffect(() => {
        if (data) {
            setSession(data.data);
            void navigate({ to: '/integrations' });
        }
    }, [data]);

    if (error) {
        return <ErrorFallback error={error} />;
    }

    return <LoadingView />;
};
