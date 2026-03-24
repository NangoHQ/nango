import { useState } from 'react';

import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { useToast } from '../../../hooks/useToast';
import { apiFetch } from '../../../utils/api';
import { globalEnv } from '../../../utils/env';
import { connectSlack } from '../../../utils/slack-connection';
import { SlackIcon } from '@/assets/SlackIcon';
import { Button } from '@/components-v2/ui/button';
import { useEnvironment, usePatchEnvironment } from '@/hooks/useEnvironment';
import { useStore } from '@/store';

export const SlackAlertsSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, refetch: refetchEnvironment } = useEnvironment(env);
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const [slackIsConnecting, setSlackIsConnecting] = useState(false);
    const { toast } = useToast();

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
            env,
            hostUrl: globalEnv.apiUrl,
            onFinish,
            onFailure
        });
    };

    const slackDisconnect = async () => {
        const res = await apiFetch(`/api/v1/connections/admin/account-${environmentAndAccount?.uuid}-${environmentAndAccount?.environment.id}?env=${env}`, {
            method: 'DELETE'
        });

        if (res.status !== 204) {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
            return;
        }

        try {
            await patchEnvironmentAsync({ slack_notifications: false });
        } catch {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
        }
    };

    return (
        <SettingsContent title="Slack alerts">
            <SettingsGroup label="Slack alerts" className="items-center">
                <div className="flex justify-end">
                    <Button
                        className="px-4"
                        disabled={slackIsConnecting}
                        variant={isConnected ? 'tertiary' : 'primary'}
                        onClick={isConnected ? slackDisconnect : slackConnect}
                    >
                        <SlackIcon className="w-5 h-5" />
                        {isConnected ? `Disconnect from Slack` : 'Connect to Slack'}
                    </Button>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
