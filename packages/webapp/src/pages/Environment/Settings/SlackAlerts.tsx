import { Unplug } from 'lucide-react';
import { useState } from 'react';

import { Badge, Button } from '@nangohq/design-system';

import { SlackIcon } from '@/assets/SlackIcon';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useEnvironment, usePatchEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useStore } from '@/store';
import { useToast } from '../../../hooks/useToast';
import { apiFetch } from '../../../utils/api';
import { globalEnv } from '../../../utils/env';
import { connectSlack } from '../../../utils/slack-connection';
import { SettingsCard, SettingsRow } from './components/SettingsCard';

export const SlackAlertsSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const { data, refetch: refetchEnvironment } = useEnvironment(env);
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const [busy, setBusy] = useState(false);
    const { toast } = useToast();

    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');
    const { confirm, DialogComponent } = useConfirmDialog();

    if (!environmentAndAccount) {
        return null;
    }
    const isConnected = environmentAndAccount.environment.slack_notifications;
    const channel = environmentAndAccount.slack_notifications_channel;

    const slackConnect = async () => {
        setBusy(true);
        await connectSlack({
            accountUUID: environmentAndAccount.uuid,
            envId: environmentAndAccount.environment.id,
            env,
            hostUrl: globalEnv.apiUrl,
            onFinish: () => {
                setBusy(false);
                void refetchEnvironment();
            },
            onFailure: () => setBusy(false)
        });
    };

    const slackDisconnect = async () => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/v1/connections/admin/account-${environmentAndAccount.uuid}-${environmentAndAccount.environment.id}?env=${env}`, {
                method: 'DELETE'
            });
            if (res.status !== 204) {
                toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
                return;
            }
            await patchEnvironmentAsync({ slack_notifications: false });
            toast({ title: 'Slack disconnected', variant: 'success' });
        } catch {
            toast({ title: 'There was a problem when disconnecting Slack', variant: 'error' });
        } finally {
            setBusy(false);
        }
    };

    if (!isConnected) {
        return (
            <SettingsCard title="Slack">
                <div className="flex flex-wrap items-center gap-4">
                    <span className="flex size-10 items-center justify-center rounded-ds-sm bg-surface-panel-inset">
                        <SlackIcon className="size-5" />
                    </span>
                    <div className="flex min-w-50 flex-1 flex-col">
                        <span className="type-text-medium-sm text-text-strong">Not connected</span>
                        <span className="type-text-regular-sm text-text-secondary">Get failed connections and syncs in a Slack channel.</span>
                    </div>
                    <PermissionGate condition={canEditEnvironment}>
                        {(allowed) => (
                            <Button variant="primary" disabled={!allowed} loading={busy} onClick={() => void slackConnect()}>
                                Connect to Slack
                            </Button>
                        )}
                    </PermissionGate>
                </div>
            </SettingsCard>
        );
    }

    return (
        <SettingsCard
            title={
                <span className="inline-flex items-center gap-2">
                    Slack
                    <Badge variant="success">Connected</Badge>
                </span>
            }
            action={
                canEditEnvironment && (
                    <Button
                        variant="danger-ghost"
                        size="sm"
                        loading={busy}
                        onClick={() =>
                            void confirm({
                                title: 'Disconnect Slack?',
                                description: channel
                                    ? `Nango stops posting alerts to ${channel}. You can connect again anytime.`
                                    : 'Nango stops posting alerts to Slack. You can connect again anytime.',
                                confirmButtonText: 'Disconnect',
                                confirmVariant: 'danger',
                                onConfirm: slackDisconnect
                            })
                        }
                    >
                        <Unplug />
                        Disconnect
                    </Button>
                )
            }
        >
            {DialogComponent}
            <SettingsRow label="Channel">
                <span className="type-code-regular-sm text-text-default md:pt-1.5">{channel || '—'}</span>
            </SettingsRow>
        </SettingsCard>
    );
};
