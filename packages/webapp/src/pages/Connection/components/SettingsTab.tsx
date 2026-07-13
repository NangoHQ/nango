import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { permissions } from '@nangohq/authz';
import { Button } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteConnection } from '@/hooks/useConnections';
import { useEnvironment } from '@/hooks/useEnvironment';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useConnectionContext } from '@/pages/Connection/Show';
import { useStore } from '@/store';
import { ConnectionSideInfo } from './ConnectionSideInfo';

export const SettingsTab = () => {
    const env = useStore((state) => state.env);
    const { connectionData, providerConfigKey } = useConnectionContext();
    const { connection } = connectionData;
    const { data } = useEnvironment(env);
    const environment = data?.environmentAndAccount?.environment;
    const { can } = usePermissions();
    const canDeleteConnection = can(permissions.canDeleteProdConnections) || !environment?.is_production;
    const navigate = useNavigate();

    const { toast } = useToast();
    const { mutateAsync: deleteConnection, isPending: isDeletingConnection } = useDeleteConnection();
    const { confirm, DialogComponent } = useConfirmDialog();

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
                <ConnectionSideInfo connectionData={connectionData} />
            </div>
        </>
    );
};
