import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import { apiConnectSessions } from '../../hooks/useConnect';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { createConnectUIPreviewIFrame } from '../../utils/connect-ui';
import { globalEnv } from '../../utils/env';

export const ConnectUISettings = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const connectUIContainer = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const openConnectUI = async () => {
            if (!environmentAndAccount || !connectUIContainer.current) {
                return;
            }

            const res = await apiConnectSessions(env, {
                end_user: {
                    id: 'previewUserId',
                    email: 'preview@nango.dev',
                    display_name: 'Preview User'
                }
            });

            if (!res.res.ok || `error` in res.json) {
                toast.toast({ title: 'Failed to create connect session', variant: 'error' });
                return;
            }

            const iframe = createConnectUIPreviewIFrame({
                baseURL: globalEnv.connectUrl,
                apiURL: globalEnv.apiUrl,
                sessionToken: res.json.data.token
            });

            connectUIContainer.current.appendChild(iframe);
        };
        void openConnectUI();
    }, [env, environmentAndAccount, toast]);

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
