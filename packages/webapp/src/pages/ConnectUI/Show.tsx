import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import { apiConnectSessions } from '../../hooks/useConnect';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { APIError } from '../../utils/api';
import { createConnectUIPreviewIFrame } from '../../utils/connect-ui';
import { globalEnv } from '../../utils/env';

export const ConnectUISettings = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const connectUIContainer = useRef<HTMLDivElement>(null);
    const connectUIIframe = useRef<HTMLIFrameElement>();

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
        refetchInterval: 1000,
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
    }, [env, environmentAndAccount, sessionToken, toast]);

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI} className="p-6 w-full h-full">
            <Helmet>
                <title>Connect UI - Nango</title>
            </Helmet>
            <div className="flex flex-col h-full">
                <h2 className="mb-8 text-3xl font-semibold tracking-tight text-white">Connect UI Settings</h2>
                <div className="h-full flex justify-end">
                    <div ref={connectUIContainer} className="h-full w-[500px] overflow-hidden" />
                </div>
            </div>
        </DashboardLayout>
    );
};
