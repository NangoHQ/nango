import { useQueryClient } from '@tanstack/react-query';
import { Link2, Plug, TriangleAlert } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useUnmount } from 'react-use';
import { useSWRConfig } from 'swr';

import { permissions } from '@nangohq/authz';
import { Button } from '@nangohq/design-system';
import Nango from '@nangohq/frontend';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { apiConnectSessionsReconnect } from '@/hooks/useConnect';
import { clearConnectionsCache } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useConnectionContext } from '@/pages/Connection/Show';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { formatDateToPreciseUSFormat } from '@/utils/utils';

import type { AuthResult, ConnectUI, OnConnectEvent } from '@nangohq/frontend';

export const ReconnectPanel = () => {
    const env = useStore((state) => state.env);
    const toast = useToast();
    const queryClient = useQueryClient();
    const { cache, mutate } = useSWRConfig();

    const { connectionData, providerConfigKey } = useConnectionContext();
    const { connection } = connectionData;

    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const isDarkMode = useThemeStore(darkModeSelector);

    const { can } = usePermissions();
    const canReconnect = can(permissions.canWriteProdConnections) || !environmentAndAccount?.environment.is_production;

    const isDashboardOrigin = connection.tags.origin === 'nango_dashboard';

    const { confirm, DialogComponent } = useConfirmDialog();

    const connectUI = useRef<ConnectUI>();
    const hasConnected = useRef<AuthResult | undefined>();
    const [isShareLinkLoading, setIsShareLinkLoading] = useState(false);

    const invalidateConnectionQueries = useCallback(() => {
        void queryClient.invalidateQueries({ queryKey: ['connection', connection.connection_id, env, providerConfigKey] });
        void queryClient.invalidateQueries({ queryKey: ['connections'] });
        clearConnectionsCache(cache, mutate);
    }, [queryClient, connection.connection_id, env, providerConfigKey, cache, mutate]);

    const createReconnectSession = useCallback(async () => {
        return await apiConnectSessionsReconnect(env, {
            connection_id: connection.connection_id,
            provider_config_key: providerConfigKey
        });
    }, [env, connection.connection_id, providerConfigKey]);

    const onEvent: OnConnectEvent = useCallback(
        (event) => {
            if (event.type === 'close') {
                if (hasConnected.current) {
                    toast.toast({ title: 'Connection reauthenticated', variant: 'success' });
                }
            } else if (event.type === 'connect') {
                hasConnected.current = event.payload;
                invalidateConnectionQueries();
            }
        },
        [toast, invalidateConnectionQueries]
    );

    const startReconnect = () => {
        if (!environmentAndAccount) {
            return;
        }

        hasConnected.current = undefined;

        const nango = new Nango({
            host: globalEnv.apiUrl,
            websocketsPath: environmentAndAccount.environment.websockets_path || ''
        });

        // Captured locally (not just via the connectUI ref) so a stale callback from a
        // prior click can't apply its session token to a newer popup instance.
        const ui = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            onEvent,
            themeOverride: isDarkMode ? 'dark' : 'light'
        });
        connectUI.current = ui;

        // Defer session creation so the popup can open and show a loading state immediately.
        setTimeout(async () => {
            try {
                const res = await createReconnectSession();
                if ('error' in res.json) {
                    toast.toast({ title: 'Failed to start reconnect', variant: 'error' });
                    ui.close();
                    return;
                }
                ui.setSessionToken(res.json.data.token);
            } catch {
                toast.toast({ title: 'Failed to start reconnect', variant: 'error' });
                ui.close();
            }
        }, 0);
    };

    const onClickReconnect = () => {
        if (isDashboardOrigin) {
            startReconnect();
            return;
        }

        void confirm({
            title: 'Reconnect this connection?',
            description:
                "This connection wasn't created from this dashboard. Reconnecting here will authenticate as whoever completes the popup in this browser, which may not be the original account. If someone else needs to reconnect, use Share reconnect link instead.",
            confirmButtonText: 'Reconnect anyway',
            confirmVariant: 'primary',
            icon: <TriangleAlert />,
            onConfirm: startReconnect
        });
    };

    const onClickShareReconnectLink = async () => {
        setIsShareLinkLoading(true);
        try {
            const res = await createReconnectSession();
            if (!res.res.ok || 'error' in res.json) {
                toast.toast({ title: 'Failed to create shareable link', variant: 'error' });
                return;
            }

            const { connect_link: connectLink, expires_at: expiresAt } = res.json.data;
            const shareUrl = new URL(connectLink);
            shareUrl.searchParams.set('apiURL', globalEnv.apiUrl);

            try {
                await navigator.clipboard.writeText(shareUrl.toString());
                toast.toast({
                    title: 'Shareable link copied',
                    description: `Session expires in 30 mins (${formatDateToPreciseUSFormat(expiresAt)})`,
                    variant: 'success'
                });
            } catch (_) {
                toast.toast({ title: 'Failed to copy link', variant: 'error' });
            }
        } catch (_) {
            toast.toast({ title: 'Failed to create shareable link', variant: 'error' });
        } finally {
            setIsShareLinkLoading(false);
        }
    };

    useUnmount(() => {
        if (connectUI.current) {
            connectUI.current.close();
        }
    });

    return (
        <div className="flex flex-col gap-3">
            {DialogComponent}
            <div className="flex flex-row items-center gap-2">
                <PermissionGate condition={canReconnect}>
                    {(allowed) => (
                        <Button variant="outline" size="md" onClick={onClickReconnect} disabled={!allowed}>
                            <Plug />
                            Reconnect
                        </Button>
                    )}
                </PermissionGate>
                <PermissionGate condition={canReconnect}>
                    {(allowed) => (
                        <Button variant="ghost" size="md" onClick={onClickShareReconnectLink} loading={isShareLinkLoading} disabled={!allowed}>
                            <Link2 />
                            Share reconnect link
                        </Button>
                    )}
                </PermissionGate>
                <InfoTooltip side="top">Anyone with this link can open Connect UI and finish reconnecting. The link expires in 30 minutes.</InfoTooltip>
            </div>
        </div>
    );
};
