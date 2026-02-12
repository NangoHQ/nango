import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { ConnectionSideInfo } from './ConnectionSideInfo';
import { Button } from '@/components-v2/ui/button';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDeleteConnection } from '@/hooks/useConnections';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { GetConnection } from '@nangohq/types';

export const SettingsTab: React.FC<{ connectionData: GetConnection['Success']['data']; providerConfigKey: string }> = ({
    connectionData,
    providerConfigKey
}) => {
    const env = useStore((state) => state.env);
    const { connection } = connectionData;
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
                    <span className="text-body-medium-semi text-text-primary">Connection deletion</span>
                    <Button
                        variant="destructive"
                        size="lg"
                        loading={isDeletingConnection}
                        onClick={() =>
                            confirm({
                                title: 'Delete connection?',
                                description: 'All credentials & synced data associated with this connection will be deleted.',
                                confirmButtonText: 'Delete connection',
                                confirmVariant: 'destructive',
                                onConfirm: onDelete
                            })
                        }
                    >
                        <Trash2 />
                        Delete connection
                    </Button>
                </div>

                <ConnectionSideInfo connectionData={connectionData} />
            </div>
        </>
    );
};
