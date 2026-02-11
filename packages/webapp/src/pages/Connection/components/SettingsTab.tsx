import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
            const { res } = await deleteConnection({
                params: { connectionId: connection.connection_id },
                query: { provider_config_key: providerConfigKey, env }
            });

            if (!res.ok) {
                toast({ title: 'Failed to delete connection', variant: 'error' });
            }

            navigate(`/${env}/connections`, { replace: true });
        } catch {
            toast({ title: 'Failed to delete connection', variant: 'error' });
        }
    };

    return (
        <>
            {DialogComponent}
            <div className="flex items-center justify-between">
                <span className="text-body-medium-semi text-text-primary">Connection suppression</span>
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
        </>
    );
};
