import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useSearchParam } from 'react-use';

import { ErrorFallback } from '@/components/ErrorFallback';
import { LoadingView } from '@/components/LoadingView';
import { getConnectSession } from '@/lib/api';
import { triggerReady } from '@/lib/events';
import { useGlobal } from '@/lib/store';
import { telemetry } from '@/lib/telemetry';
import { isValidTheme, setTheme } from '@/lib/theme';
import { updateSettings } from '@/lib/updateSettings';

import type { ConnectUIEventSettingsChanged, ConnectUIEventToken } from '@nangohq/frontend';

export const Home: React.FC = () => {
    const navigate = useNavigate();
    const { sessionToken, setApiURL, setSession, setSessionToken, setDetectClosedAuthWindow, setIsEmbedded, setIsPreview } = useGlobal();

    const { data, error } = useQuery({ enabled: sessionToken !== null, queryKey: ['sessionToken'], queryFn: getConnectSession });
    const apiURL = useSearchParam('apiURL');
    const theme = useSearchParam('theme');
    const isEmbedded = useSearchParam('embedded');
    const isPreview = useSearchParam('preview') === 'true';
    const detectClosedAuthWindow = useSearchParam('detectClosedAuthWindow');

    useEffect(() => {
        // Listen to parent
        // the parent will send the sessionToken through post message
        const listener: (this: Window, ev: MessageEvent) => void = (evt) => {
            if (!evt.data || !('type' in evt.data)) {
                return;
            }
            switch (evt.data.type) {
                case 'session_token': {
                    const data = evt.data as ConnectUIEventToken;
                    setSessionToken(data.sessionToken);
                    break;
                }
                case 'settings_changed': {
                    // Only allow dynamic theme changing in preview mode
                    if (!isPreview) {
                        break;
                    }
                    const data = evt.data as ConnectUIEventSettingsChanged;
                    updateSettings(data.payload);
                    break;
                }
            }
            // Let the state propagate
            setTimeout(() => telemetry('open'), 1);
        };
        window.addEventListener('message', listener, false);

        // Tell the parent we are ready to receive message
        triggerReady();

        const search = new URLSearchParams(window.location.search);
        const inUrl = search.get('session_token');
        if (inUrl) {
            setSessionToken(inUrl);
        }

        if (isPreview) {
            // Don't clear event listeners on preview
            return;
        }

        return () => {
            window.removeEventListener('message', listener, false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (apiURL) setApiURL(apiURL);
        if (detectClosedAuthWindow) setDetectClosedAuthWindow(detectClosedAuthWindow === 'true');
        if (isEmbedded) setIsEmbedded(isEmbedded === 'true');
        if (isPreview) setIsPreview(isPreview);
        if (theme && isValidTheme(theme)) setTheme(theme);
    }, [apiURL, detectClosedAuthWindow, isEmbedded, isPreview, setApiURL, setDetectClosedAuthWindow, setIsEmbedded, setIsPreview, theme]);

    useEffect(() => {
        if (data) {
            setSession(data.data);
            const themeOverride = theme && isValidTheme(theme) ? theme : undefined;
            updateSettings(data.data.connectUISettings, themeOverride);
            void navigate({ to: '/integrations' });
        }
    }, [data]);

    if (error) {
        return <ErrorFallback error={error} />;
    }

    return <LoadingView />;
};
