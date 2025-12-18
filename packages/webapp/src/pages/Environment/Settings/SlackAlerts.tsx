import { useState } from 'react';

import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { useToast } from '../../../hooks/useToast';
import { apiFetch } from '../../../utils/api';
import { globalEnv } from '../../../utils/env';
import { connectSlack } from '../../../utils/slack-connection';
import { Button } from '@/components-v2/ui/button';
import { apiPatchEnvironment, useEnvironment } from '@/hooks/useEnvironment';
import { useStore } from '@/store';

export const SlackAlertsSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);
    const [slackIsConnecting, setSlackIsConnecting] = useState(false);
    const { toast } = useToast();

    if (!environmentAndAccount) {
        return null;
    }
    const isConnected = environmentAndAccount.environment.slack_notifications;

    const slackConnect = async () => {
        setSlackIsConnecting(true);
        const onFinish = () => {
            void mutate();
            setSlackIsConnecting(false);
        };

        const onFailure = () => {
            setSlackIsConnecting(false);
        };
        await connectSlack({ accountUUID: environmentAndAccount.uuid, env, hostUrl: globalEnv.apiUrl, onFinish, onFailure });
    };

    const slackDisconnect = async () => {
        const res = await apiFetch(`/api/v1/connections/admin/account-${environmentAndAccount?.uuid}-${env}?env=${env}`, {
            method: 'DELETE'
        });

        if (res.status !== 204) {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
            return;
        }

        const resPatch = await apiPatchEnvironment(env, { slack_notifications: false });
        if ('error' in resPatch.json) {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
            return;
        }

        void mutate();
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
                        <IntegrationLogo provider="slack" />
                        {isConnected ? `Disconnect from Slack` : 'Connect to Slack'}
                    </Button>
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
