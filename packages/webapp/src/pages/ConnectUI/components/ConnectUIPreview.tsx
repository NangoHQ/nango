import { useQuery } from '@tanstack/react-query';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { apiConnectSessions } from '../../../hooks/useConnect';
import { useEnvironment } from '../../../hooks/useEnvironment';
import { useStore } from '../../../store';
import { APIError } from '../../../utils/api';
import { createConnectUIPreviewIFrame } from '../../../utils/connect-ui';
import { globalEnv } from '../../../utils/env';
import { cn } from '../../../utils/utils';

import type { ConnectUIEventSettingsChanged } from '@nangohq/frontend/lib/types';

export interface ConnectUIPreviewRef {
    sendSettingsChanged: (settings: ConnectUIEventSettingsChanged['payload']) => void;
}

export const ConnectUIPreview = forwardRef<ConnectUIPreviewRef, { className?: string }>(({ className }, ref) => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const connectUIContainer = useRef<HTMLDivElement>(null);
    const connectUIIframe = useRef<HTMLIFrameElement>();

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
        if (!sessionToken || !connectUIIframe.current) {
            return;
        }

        const iframe = connectUIIframe.current;
        iframe.contentWindow?.postMessage(
            {
                type: 'session_token',
                sessionToken
            },
            '*'
        );
    }, [sessionToken, connectUIIframe]);

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
    }, [env, environmentAndAccount, sessionToken]);

    return <div ref={connectUIContainer} className={cn('overflow-hidden', className)} />;
});

ConnectUIPreview.displayName = 'ConnectUIPreview';
