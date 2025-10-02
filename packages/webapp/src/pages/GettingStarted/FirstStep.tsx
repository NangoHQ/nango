import { IconBrandGoogleFilled } from '@tabler/icons-react';
import { useCallback, useRef } from 'react';
import { useUnmount } from 'react-use';

import Nango from '@nangohq/frontend';

import { apiConnectSessions } from '../../hooks/useConnect';
import { apiDeleteConnection } from '../../hooks/useConnections';
import { useEnvironment } from '../../hooks/useEnvironment';
import { GetUsageQueryKey } from '../../hooks/usePlan';
import { useToast } from '../../hooks/useToast';
import { useUser } from '../../hooks/useUser';
import { queryClient, useStore } from '../../store';
import { globalEnv } from '../../utils/env';
import { StyledLink } from '@/components-v2/StyledLink';
import { Button } from '@/components-v2/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components-v2/ui/tooltip';

import type { ConnectUI, OnConnectEvent } from '@nangohq/frontend';
import type { GettingStartedOutput } from '@nangohq/types';

const truncateMiddle = (str: string, maxLength: number = 20): string => {
    if (str.length <= maxLength) {
        return str;
    }

    const startLength = Math.ceil((maxLength - 3) / 2);
    const endLength = Math.floor((maxLength - 3) / 2);

    return `${str.slice(0, startLength)}...${str.slice(-endLength)}`;
};

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
            try {
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
                    connectUI.current?.close();
                    return;
                }
                connectUI.current!.setSessionToken(res.json.data.token);
            } catch {
                connectUI.current?.close();
            }
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
        try {
            const { res } = await apiDeleteConnection({ connectionId: connection.connection_id }, { env, provider_config_key: integration.unique_key });
            if (!res.ok) {
                throw new Error('Failed to delete connection');
            }
            onDisconnected();
        } catch {
            toast({ title: 'Failed to delete connection', variant: 'error' });
        }
    };

    if (connection) {
        return (
            <div className="flex flex-col gap-7">
                <div className="flex flex-col gap-1.5">
                    <h3 className="text-brand-500 text-sm font-semibold">Google Calendar connection authorized!</h3>
                    <p className="text-text-tertiary text-sm">
                        A connection was created with the connection id:{' '}
                        <Tooltip>
                            <TooltipTrigger>
                                <StyledLink to={`/${env}/connections/${integration?.unique_key}/${connection.connection_id}`} icon>
                                    {truncateMiddle(connection.connection_id)}
                                </StyledLink>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">{connection.connection_id}</TooltipContent>
                        </Tooltip>
                    </p>
                </div>
                <Button variant="tertiary" size="lg" onClick={onClickDisconnect} className="w-fit">
                    <IconBrandGoogleFilled className="size-5 mr-2" />
                    Disconnect from Google Calendar
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-1.5">
                <h3 className="text-text-primary text-sm font-semibold">Experience the user&apos;s auth flow</h3>
                <p className="text-text-tertiary text-sm">
                    Connect your account just like your users would in your app. <br />
                    This will create a connection for your{' '}
                    <StyledLink icon={true} type="external" to={`/${env}/integrations/${integration?.unique_key}`}>
                        Google Calendar integration
                    </StyledLink>
                    .
                </p>
            </div>
            <Button variant="primary" size="lg" onClick={onClickConnect} className="w-fit">
                <IconBrandGoogleFilled className="size-5 mr-2" />
                Connect to Google Calendar
            </Button>
        </div>
    );
};
