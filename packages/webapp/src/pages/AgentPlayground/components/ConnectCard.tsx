import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useUnmount } from 'react-use';

import { Button } from '@nangohq/design-system';
import Nango from '@nangohq/frontend';

import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { useEnvironment } from '@/hooks/useEnvironment';
import { darkModeSelector, useThemeStore } from '@/lib/theme';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { humanize } from '../toolDisplay';

import type { ConnectUI } from '@nangohq/frontend';

interface ConnectCardProps {
    integrationId: string;
    provider: string;
    connectUrl: string;
    onConnected: (integrationId: string) => void;
}

export const ConnectCard: React.FC<ConnectCardProps> = ({ integrationId, provider, connectUrl, onConnected }) => {
    const env = useStore((state) => state.env);
    const { data: environmentData } = useEnvironment(env);
    const isDarkMode = useThemeStore(darkModeSelector);
    const [status, setStatus] = useState<'idle' | 'waiting' | 'connected'>('idle');
    const [failure, setFailure] = useState<string | null>(null);
    const connectUI = useRef<ConnectUI | null>(null);

    useUnmount(() => connectUI.current?.close());

    const name = humanize(integrationId);

    const connect = () => {
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
        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            sessionToken,
            themeOverride: isDarkMode ? 'dark' : 'light',
            onEvent: (event) => {
                if (event.type === 'connect') {
                    connected = true;
                    connectUI.current?.close();
                    setStatus('connected');
                    onConnected(integrationId);
                } else if (event.type === 'error') {
                    setFailure(event.payload.errorMessage);
                } else if (event.type === 'close' && !connected) {
                    setStatus('idle');
                }
            }
        });
    };

    return (
        <div className="flex items-center gap-3 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3">
            <IntegrationLogo provider={provider} className="size-8" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-medium-medium text-text-strong">Connect {name}</span>
                {failure && status === 'idle' ? (
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
            ) : (
                <Button size="sm" onClick={connect} loading={status === 'waiting'}>
                    {failure && status === 'idle' ? 'Try again' : `Connect ${name}`} <ArrowRight />
                </Button>
            )}
        </div>
    );
};
