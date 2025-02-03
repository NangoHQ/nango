import { IconServer } from '@tabler/icons-react';
import { useStore } from '../../../store';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { Button } from '../../../components/ui/button/Button';
import { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { apiFetch } from '../../../utils/api';
import { connectSlack } from '../../../utils/slack-connection';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { Input } from '../../../components/ui/input/Input';
import { WebhookCheckboxes } from './WebhookCheckboxes';

export const NotificationSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [slackIsConnecting, setSlackIsConnecting] = useState(false);

    const slackConnect = async () => {
        setSlackIsConnecting(true);
        const onFinish = () => {
            void mutate();
            toast({ title: `Slack connection created!`, variant: 'success' });
            setSlackIsConnecting(false);
        };

        const onFailure = () => {
            toast({ title: `Failed to create Slack connection!`, variant: 'error' });
            setSlackIsConnecting(false);
        };
        await connectSlack({ accountUUID: environmentAndAccount!.uuid, env, hostUrl: environmentAndAccount!.host, onFinish, onFailure });
    };

    const slackDisconnect = async () => {
        const res = await apiFetch(`/api/v1/connections/admin/account-${environmentAndAccount?.uuid}-${env}?env=${env}`, {
            method: 'DELETE'
        });

        if (res.status !== 204) {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
            return;
        }

        const resPatch = await apiPatchEnvironment({ slack_notifications: false });
        if ('error' in resPatch.json) {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
            return;
        }

        toast({ title: 'Slack was disconnected successfully.', variant: 'success' });
        void mutate();
    };

    if (!environmentAndAccount) {
        return null;
    }

    const isConnected = environmentAndAccount.environment.slack_notifications;

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <div className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10">
                <div>
                    <IconServer stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Notification Settings</h3>
            </div>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-4">
                    <label htmlFor="webhookUrl" className="font-semibold">
                        Webhooks URL
                    </label>
                    <Input
                        inputSize={'lg'}
                        variant={'black'}
                        name="webhookUrl"
                        value={environmentAndAccount.webhook_settings.primary_url || ''}
                        placeholder="https://example.com/webhooks_from_nango"
                    />
                    <Input
                        inputSize={'lg'}
                        variant={'black'}
                        name="secondaryWebhookUrl"
                        value={environmentAndAccount.webhook_settings.secondary_url || ''}
                        placeholder="https://example.com/webhooks_from_nango"
                    />
                    <WebhookCheckboxes env={env} checkboxState={environmentAndAccount.webhook_settings} mutate={mutate} />
                </fieldset>

                <fieldset className="flex gap-4 items-center">
                    <label htmlFor="envvar" className="font-semibold">
                        Slack alerts
                    </label>
                    <Button disabled={slackIsConnecting} variant={isConnected ? 'primary' : 'tertiary'} onClick={isConnected ? slackDisconnect : slackConnect}>
                        <IntegrationLogo provider="slack" />
                        {isConnected ? `Disconnect ${environmentAndAccount.slack_notifications_channel}` : 'Connect to Slack'}
                    </Button>
                </fieldset>
            </div>
        </div>
    );
};
