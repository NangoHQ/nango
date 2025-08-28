import { useRef } from 'react';
import { Helmet } from 'react-helmet';
import { useEffectOnce } from 'react-use';

import Nango from '@nangohq/frontend';

import { LeftNavBarItems } from '../../components/LeftNavBar';
import { apiConnectSessions } from '../../hooks/useConnect';
import { useEnvironment } from '../../hooks/useEnvironment';
import { useToast } from '../../hooks/useToast';
import DashboardLayout from '../../layout/DashboardLayout';
import { useStore } from '../../store';
import { globalEnv } from '../../utils/env';

import type { ConnectUI } from '@nangohq/frontend';

export const ConnectUISettings = () => {
    const toast = useToast();
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);

    const connectUI = useRef<ConnectUI>();

    const openConnectUI = async () => {
        if (!environmentAndAccount || !!connectUI.current) {
            return;
        }

        const nango = new Nango({
            host: globalEnv.apiUrl,
            websocketsPath: environmentAndAccount.environment.websockets_path || ''
        });

        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            onEvent: () => {}
        });

        const res = await apiConnectSessions(env, {
            end_user: {
                id: environmentAndAccount.uuid,
                email: environmentAndAccount.email,
                display_name: environmentAndAccount.name
            }
        });

        if (!res.res.ok || `error` in res.json) {
            toast.toast({ title: 'Failed to create connect session', variant: 'error' });
            return;
        }

        connectUI.current.setSessionToken(res.json.data.token);
    };

    useEffectOnce(() => {
        openConnectUI();
    });

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ConnectUI} className="p-6 w-full h-full">
            <Helmet>
                <title>Connect UI - Nango</title>
            </Helmet>
            <div className="flex flex-col h-full">
                <h2 className="mb-8 text-3xl font-semibold tracking-tight text-white">Connect UI Settings</h2>
            </div>
        </DashboardLayout>
    );
};
