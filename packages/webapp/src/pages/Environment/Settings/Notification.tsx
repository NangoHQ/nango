import { IconBell, IconExternalLink } from '@tabler/icons-react';
import { useStore } from '../../../store';
import { apiPatchEnvironment, apiPatchWebhook, useEnvironment } from '../../../hooks/useEnvironment';
import { Button } from '../../../components/ui/button/Button';
import { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { apiFetch } from '../../../utils/api';
import { connectSlack } from '../../../utils/slack-connection';
import IntegrationLogo from '../../../components/ui/IntegrationLogo';
import { WebhookCheckboxes } from './WebhookCheckboxes';
import { EditableInput } from './EditableInput';
import { Link } from 'react-router-dom';

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

        const resPatch = await apiPatchEnvironment(env, { slack_notifications: false });
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
            <Link className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10" to="#notification" id="notification">
                <div>
                    <IconBell stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Notification Settings</h3>
            </Link>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <div className="flex flex-col gap-4">
                    <Link to="https://docs.nango.dev/guides/webhooks/webhooks-from-nango" className="flex gap-2 items-center" target="_blank">
                        <label className="font-semibold">Webhooks URLs</label> <IconExternalLink stroke={1} size={18} />
                    </Link>

                    <EditableInput
                        name="primary_url"
                        title="Primary URL"
                        placeholder="https://example.com/webhooks_from_nango"
                        subTitle={true}
                        originalValue={environmentAndAccount.webhook_settings.primary_url || ''}
                        apiCall={(value) => apiPatchWebhook(env, { primary_url: value })}
                        onSuccess={() => void mutate()}
                    />
                    <EditableInput
                        name="secondary_url"
                        title="Secondary URL"
                        placeholder="https://example.com/webhooks_from_nango"
                        subTitle={true}
                        originalValue={environmentAndAccount.webhook_settings.secondary_url || ''}
                        apiCall={(value) => apiPatchWebhook(env, { secondary_url: value })}
                        onSuccess={() => void mutate()}
                    />
                    <WebhookCheckboxes env={env} checkboxState={environmentAndAccount.webhook_settings} mutate={mutate} />
                </div>

                <fieldset className="flex gap-4 items-center">
                    <label htmlFor="envvar" className="font-semibold">
                        Slack alerts
                    </label>
                    <Button disabled={slackIsConnecting} variant={isConnected ? 'primary' : 'primary'} onClick={isConnected ? slackDisconnect : slackConnect}>
                        <IntegrationLogo provider="slack" />
                        {isConnected ? `Disconnect ${environmentAndAccount.slack_notifications_channel}` : 'Connect to Slack'}
                    </Button>
                </fieldset>
            </div>
        </div>
    );
};
