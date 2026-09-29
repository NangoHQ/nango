import { useState } from 'react';

import { Button } from '@nangohq/design-system';

import { SlackIcon } from '@/assets/SlackIcon';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { useDisconnectSlack, useEnvironment, usePatchEnvironment, useSlackAdminAuth } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';
import { useToast } from '../../../hooks/useToast';
import { globalEnv } from '../../../utils/env';
import { connectSlack } from '../../../utils/slack-connection';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';

export const SlackAlertsSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, refetch: refetchEnvironment } = useEnvironment(env);
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);
    const { mutateAsync: getSlackAdminAuth } = useSlackAdminAuth(env);
    const { mutateAsync: disconnectSlack } = useDisconnectSlack(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const [slackIsConnecting, setSlackIsConnecting] = useState(false);
    const { toast } = useToast();

    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');

    if (!environmentAndAccount) {
        return null;
    }
    const isConnected = environmentAndAccount.environment.slack_notifications;

    const slackConnect = async () => {
        setSlackIsConnecting(true);
        const onFinish = () => {
            setSlackIsConnecting(false);
            void refetchEnvironment();
        };

        const onFailure = () => {
            setSlackIsConnecting(false);
        };
        await connectSlack({
            accountUUID: environmentAndAccount.uuid,
            envId: environmentAndAccount.environment.id,
            hostUrl: globalEnv.apiUrl,
            getAdminAuth: (connectionId) => getSlackAdminAuth({ connectionId }),
            enableNotifications: () => patchEnvironmentAsync({ slack_notifications: true }),
            onFinish,
            onFailure
        });
    };

    const slackDisconnect = async () => {
        try {
            await disconnectSlack({ connectionId: `account-${environmentAndAccount.uuid}-${environmentAndAccount.environment.id}` });
            await patchEnvironmentAsync({ slack_notifications: false });
        } catch {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
        }
    };

    return (
        <SettingsContent title="Slack alerts">
            <SettingsGroup label="Slack alerts" className="items-center">
                <div className="flex justify-end">
                    <PermissionGate asChild condition={canEditEnvironment}>
                        {(allowed) => (
                            <Button
                                className="px-4"
                                disabled={slackIsConnecting || !allowed}
                                variant={isConnected ? 'outline' : 'primary'}
                                onClick={isConnected ? slackDisconnect : slackConnect}
                            >
                                <SlackIcon className="w-5 h-5" />
                                {isConnected ? `Disconnect from Slack` : 'Connect to Slack'}
                            </Button>
                        )}
                    </PermissionGate>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
