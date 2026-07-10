import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { permissions } from '@nangohq/authz';
import { Button, FieldLabel } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { PermissionGate } from '@/components/patterns/PermissionGate';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteConnection, usePatchConnection } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useConnectionContext } from '@/pages/Connection/Show';
import { validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { ConnectionSideInfo } from './ConnectionSideInfo';

export const SettingsTab = () => {
    const env = useStore((state) => state.env);
    const { connectionData, providerConfigKey } = useConnectionContext();
    const { connection } = connectionData;
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canWriteConnection = can(permissions.canWriteProdConnections) || !environment?.is_production;
    const canDeleteConnection = can(permissions.canDeleteProdConnections) || !environment?.is_production;
    const navigate = useNavigate();

    const { toast } = useToast();
    const { mutateAsync: deleteConnection, isPending: isDeletingConnection } = useDeleteConnection();
    const { mutateAsync: patchConnection } = usePatchConnection();
    const { confirm, DialogComponent } = useConfirmDialog();

    const onSaveWebhookUrl = async (webhook_url_override: string) => {
        try {
            await patchConnection({
                params: { connectionId: connection.connection_id },
                query: { provider_config_key: providerConfigKey, env },
                body: { webhook_url: webhook_url_override }
            });
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch {
            toast({ title: 'Failed to update, an error occurred', variant: 'error' });
            throw new Error('Failed to update webhook URL');
        }
    };

    const onDelete = async () => {
        try {
            await deleteConnection({
                params: { connectionId: connection.connection_id },
                query: { provider_config_key: providerConfigKey, env }
            });
            navigate(`/${env}/connections`, { replace: true });
        } catch {
            toast({ title: 'Failed to delete connection', variant: 'error' });
        }
    };

    return (
        <>
            {DialogComponent}
            <div className="flex justify-between items-start gap-11">
                <div className="w-full flex flex-col gap-10">
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <FieldLabel htmlFor="webhook_url_override">Override webhook URL</FieldLabel>
                            <InfoTooltip>Deliver this connection&apos;s webhooks to a different URL than the environment-wide webhook URL.</InfoTooltip>
                        </div>
                        <EditableInput
                            id="webhook_url_override"
                            placeholder="https://example.com/webhooks-from-nango"
                            initialValue={connection.webhook_url_override || ''}
                            onSave={onSaveWebhookUrl}
                            validate={(value) => validateUrl(value, true)}
                            canEdit={canWriteConnection}
                        />
                    </div>
                    <div className="w-full flex items-center justify-between">
                        <span className="text-body-medium-semi text-text-strong">Connection deletion</span>
                        <PermissionGate condition={canDeleteConnection} asChild>
                            {(allowed) => (
                                <Button
                                    variant="danger"
                                    size="md"
                                    loading={isDeletingConnection}
                                    disabled={!allowed}
                                    onClick={() =>
                                        confirm({
                                            title: 'Delete connection?',
                                            description: 'All credentials & synced data associated with this connection will be deleted.',
                                            confirmButtonText: 'Delete connection',
                                            confirmVariant: 'danger',
                                            onConfirm: onDelete
                                        })
                                    }
                                >
                                    <Trash2 />
                                    Delete connection
                                </Button>
                            )}
                        </PermissionGate>
                    </div>
                </div>
                <ConnectionSideInfo connectionData={connectionData} />
            </div>
        </>
    );
};
