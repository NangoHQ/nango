import { IconBrandGoogleFilled, IconX } from '@tabler/icons-react';
import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useUnmount } from 'react-use';

import Nango from '@nangohq/frontend';

import LinkWithIcon from '../../components/LinkWithIcon';
import { Button } from '../../components/ui/button/Button';
import { apiConnectSessions } from '../../hooks/useConnect';
import { apiDeleteConnection } from '../../hooks/useConnections';
import { useEnvironment } from '../../hooks/useEnvironment';
import { GetUsageQueryKey } from '../../hooks/usePlan';
import { useToast } from '../../hooks/useToast';
import { useUser } from '../../hooks/useUser';
import { queryClient, useStore } from '../../store';
import { globalEnv } from '../../utils/env';

import type { ConnectUI, OnConnectEvent } from '@nangohq/frontend';
import type { GettingStartedOutput } from '@nangohq/types';

interface FirstStepProps {
    connection: GettingStartedOutput['connection'] | null;
    integration: GettingStartedOutput['meta']['integration'] | null;
    onConnectClicked: () => void;
    onConnected: (connectionId: string) => void;
    onDisconnected: () => void;
}

export const FirstStep: React.FC<FirstStepProps> = ({ connection, integration, onConnectClicked, onConnected, onDisconnected }) => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount } = useEnvironment(env);
    const { user } = useUser();

    const { toast } = useToast();
    const connectUI = useRef<ConnectUI>();

    const onClickConnect = () => {
        if (!environmentAndAccount || !user) {
            return;
        }

        onConnectClicked();

        const nango = new Nango({
            host: globalEnv.apiUrl,
            websocketsPath: environmentAndAccount.environment.websockets_path || ''
        });

        connectUI.current = nango.openConnectUI({
            baseURL: globalEnv.connectUrl,
            apiURL: globalEnv.apiUrl,
            onEvent
        });

        // We defer the token creation so the iframe can open and display a loading screen
        //   instead of blocking the main loop and no visual clue for the end user
        setTimeout(async () => {
            const res = await apiConnectSessions(env, {
                allowed_integrations: integration ? [integration.unique_key] : undefined,
                end_user: {
                    id: user.id.toString(),
                    email: user.email,
                    display_name: user.name
                },
                organization: undefined
            });
            if ('error' in res.json) {
                if (connectUI.current) {
                    connectUI.current.close();
                }
                return;
            }
            connectUI.current!.setSessionToken(res.json.data.token);
        }, 10);
    };

    const onEvent: OnConnectEvent = useCallback(
        (event) => {
            if (event.type === 'connect') {
                queryClient.invalidateQueries({ queryKey: GetUsageQueryKey });
                onConnected(event.payload.connectionId);
            }
        },
        [onConnected]
    );

    useUnmount(() => {
        if (connectUI.current) {
            connectUI.current.close();
        }
    });

    const onClickDisconnect = async () => {
        if (!connection || !integration) {
            return;
        }
        const { res } = await apiDeleteConnection({ connectionId: connection.connection_id }, { env, provider_config_key: integration.unique_key });
        if (!res.ok) {
            toast({ title: 'Failed to delete connection', variant: 'error' });
            return;
        }
        onDisconnected();
    };

    if (connection) {
        return (
            <div className="text-text-secondary text-sm">
                <h3 className="text-success-4 text-lg font-semibold mb-3">Google Calendar Authorized!</h3>
                <Button variant="primary" className="mt-5" onClick={onClickDisconnect}>
                    <IconX className="w-4 h-4 mr-2" />
                    Disconnect from Google Calendar
                </Button>
                <p className="mt-5 text-text-primary text-sm flex flex-row gap-1">
                    A connection was created with the connection id:{' '}
                    <LinkWithIcon to={`/${env}/connections/${integration?.unique_key}/${connection.connection_id}`}>{connection.connection_id}</LinkWithIcon>
                </p>
            </div>
        );
    }

    return (
        <div>
            <h3 className="text-text-primary text-lg font-semibold mb-3">Experience the user&apos;s auth flow</h3>
            <div className="flex flex-col gap-5">
                <p className="text-text-secondary text-sm">Connect your account just like your users would in your app.</p>
                <Button variant="primary" className="w-fit" onClick={onClickConnect}>
                    <IconBrandGoogleFilled className="w-4 h-4 mr-2" />
                    Connect to Google Calendar
                </Button>
                <p className="text-text-secondary text-sm">
                    This will create a connection for your{' '}
                    <Link to={`/${env}/integrations/${integration?.unique_key}`} className="underline">
                        Google Calendar integration
                    </Link>
                    , which we have setup for you.
                </p>
            </div>
        </div>
    );
};
