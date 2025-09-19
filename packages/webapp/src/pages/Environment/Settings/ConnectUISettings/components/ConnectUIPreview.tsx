import { useQuery } from '@tanstack/react-query';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { apiConnectSessions } from '@/hooks/useConnect';
import { useEnvironment } from '@/hooks/useEnvironment';
import { useStore } from '@/store';
import { APIError } from '@/utils/api';
import { createConnectUIPreviewIFrame } from '@/utils/connect-ui';
import { globalEnv } from '@/utils/env';
import { cn } from '@/utils/utils';

import type { ConnectUIEventSettingsChanged, ConnectUIEventToken } from '@nangohq/frontend/lib/types';

export interface ConnectUIPreviewRef {
    sendSettingsChanged: (settings: ConnectUIEventSettingsChanged['payload']) => void;
}

export const ConnectUIPreview = forwardRef<ConnectUIPreviewRef, { className?: string }>(({ className }, ref) => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const connectUIContainer = useRef<HTMLDivElement>(null);
    const connectUIIframe = useRef<HTMLIFrameElement>();
    const [isReady, setIsReady] = useState(false);

    useImperativeHandle(ref, () => ({
        sendSettingsChanged: (settings: ConnectUIEventSettingsChanged['payload']) => {
            if (connectUIIframe.current?.contentWindow) {
                const message: ConnectUIEventSettingsChanged = {
                    type: 'settings_changed',
                    payload: settings
                };
                connectUIIframe.current.contentWindow.postMessage(message, '*');
            }
        }
    }));

    const { data: sessionToken } = useQuery<string>({
        enabled: Boolean(env),
        queryKey: [env, 'preview-session-token'],
        queryFn: async () => {
            const res = await apiConnectSessions(env, {
                end_user: {
                    id: 'previewUserId',
                    email: 'preview@nango.dev',
                    display_name: 'Preview User'
                }
            });

            if (!res.res.ok || 'error' in res.json) {
                throw new APIError({ res: res.res, json: res.json });
            }

            return res.json.data.token;
        },
        refetchInterval: 1000 * 60 * 5, // 5 minutes
        refetchIntervalInBackground: true,
        staleTime: 0
    });

    useEffect(() => {
        function listener(event: MessageEvent) {
            // Origin validation for security
            if (event.origin !== globalEnv.connectUrl) {
                return;
            }

            if (event?.data?.type === 'ready') {
                setIsReady(true);
            }
        }

        window.addEventListener('message', listener, false);

        return () => {
            window.removeEventListener('message', listener);
        };
    }, []);

    const trySendSessionToken = useCallback(() => {
        if (!sessionToken || !isReady || !connectUIIframe.current) {
            return;
        }

        const message: ConnectUIEventToken = {
            type: 'session_token',
            sessionToken
        };

        const iframe = connectUIIframe.current;
        iframe.contentWindow?.postMessage(message, '*');
    }, [sessionToken, isReady, connectUIIframe]);

    useEffect(() => {
        trySendSessionToken();
    }, [isReady, sessionToken, connectUIIframe, trySendSessionToken]);

    useEffect(() => {
        if (!environmentAndAccount || !connectUIContainer.current || connectUIIframe.current) {
            return;
        }

        const iframe = createConnectUIPreviewIFrame({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            sessionToken
        });

        connectUIIframe.current = iframe;
        connectUIContainer.current.appendChild(iframe);
    }, [env, environmentAndAccount, trySendSessionToken, sessionToken]);

    return <div ref={connectUIContainer} className={cn('overflow-hidden h-full w-full', className)} />;
});

ConnectUIPreview.displayName = 'ConnectUIPreview';
