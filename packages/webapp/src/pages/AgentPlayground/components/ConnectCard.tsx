import { ArrowRight, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useUnmount } from 'react-use';

import { Button } from '@nangohq/design-system';
import Nango from '@nangohq/frontend';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { useEnvironment } from '@/hooks/useEnvironment';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useStore } from '@/store';
import { track } from '@/utils/analytics';
import { globalEnv } from '@/utils/env';

import type { ConnectUI } from '@nangohq/frontend';

interface ConnectCardProps {
    integrationId: string;
    provider: string;
    name: string;
    connectUrl: string;
    expiresAt: string | undefined;
    connected: boolean;
    onConnected: (integrationId: string) => void;
    onRequestNewLink: (integrationId: string) => void;
}

function hasExpired(expiresAt: string | undefined): boolean {
    return expiresAt !== undefined && Date.parse(expiresAt) <= Date.now();
}

export const ConnectCard: React.FC<ConnectCardProps> = ({
    integrationId,
    provider,
    name,
    connectUrl,
    expiresAt,
    connected: alreadyConnected,
    onConnected,
    onRequestNewLink
}) => {
    const env = useStore((state) => state.env);
    const { data: environmentData } = useEnvironment(env);
    const isDarkMode = useThemeStore(darkModeSelector);
    const [status, setStatus] = useState<'idle' | 'waiting' | 'connected'>(alreadyConnected ? 'connected' : 'idle');
    const [failure, setFailure] = useState<string | null>(null);
    const [expired, setExpired] = useState(() => hasExpired(expiresAt));
    const [newLinkRequested, setNewLinkRequested] = useState(false);
    const connectUI = useRef<ConnectUI | null>(null);

    useUnmount(() => connectUI.current?.close());

    useEffect(() => {
        if (expired || expiresAt === undefined) {
            return;
        }
        const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(expiresAt) - Date.now()));
        return () => clearTimeout(timer);
    }, [expired, expiresAt]);

    const connect = () => {
        if (hasExpired(expiresAt)) {
            setExpired(true);
            return;
        }
        const sessionToken = new URL(connectUrl).searchParams.get('session_token');
        if (!sessionToken) {
            return;
        }

        const nango = new Nango({
            host: globalEnv.apiUrl,
            websocketsPath: environmentData?.environmentAndAccount.environment.websockets_path || ''
        });
        let connected = false;

        setStatus('waiting');
        setFailure(null);
        track('connections:create_button_click', { provider, is_playground: true });
        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            sessionToken,
            themeOverride: isDarkMode ? 'dark' : 'light',
            onEvent: (event) => {
                if (event.type === 'connect') {
                    connected = true;
                    track('connections:connection_create', { provider, is_legacy_flow: false, is_playground: true, is_success: true });
                    connectUI.current?.close();
                    setStatus('connected');
                    onConnected(integrationId);
                } else if (event.type === 'error') {
                    track('connections:connection_create', {
                        provider,
                        is_legacy_flow: false,
                        is_playground: true,
                        is_success: false,
                        error_code: event.payload.errorType
                    });
                    setFailure(event.payload.errorMessage);
                } else if (event.type === 'close' && !connected) {
                    setStatus('idle');
                }
            }
        });
    };

    return (
        <div className="flex items-center gap-3 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3">
            <IntegrationLogo provider={provider} className="size-6 shrink-0 border-0 bg-transparent p-0" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-medium-medium text-text-strong">Connect {name}</span>
                {expired && status === 'idle' ? (
                    <span className="flex items-center gap-1 text-body-small-regular text-text-warning">
                        <Clock className="size-3.5 shrink-0 text-icon-warning" />
                        This link has expired.
                    </span>
                ) : failure && status === 'idle' ? (
                    <span className="flex items-center gap-1 text-body-small-regular text-text-danger">
                        <XCircle className="size-3.5 shrink-0 text-icon-danger" />
                        <span className="line-clamp-2">{`Couldn't connect: ${failure}`}</span>
                    </span>
                ) : (
                    <span className="text-body-small-regular text-text-secondary">
                        {status === 'connected' ? 'Connected. The agent is carrying on.' : 'The agent needs access to continue.'}
                    </span>
                )}
            </div>
            {status === 'connected' ? (
                <CheckCircle2 className="size-4 text-icon-success" />
            ) : expired && status === 'idle' ? (
                <Button
                    size="sm"
                    variant="secondary"
                    disabled={newLinkRequested}
                    onClick={() => {
                        setNewLinkRequested(true);
                        onRequestNewLink(integrationId);
                    }}
                >
                    <RotateCcw /> {newLinkRequested ? 'New link requested' : 'Get a new link'}
                </Button>
            ) : (
                <Button size="sm" onClick={connect} loading={status === 'waiting'}>
                    {failure && status === 'idle' ? 'Try again' : 'Connect'} <ArrowRight />
                </Button>
            )}
        </div>
    );
};
