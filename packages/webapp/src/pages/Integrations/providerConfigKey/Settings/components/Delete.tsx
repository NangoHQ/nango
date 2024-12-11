import { useState } from 'react';
import { Button } from '../../../../../components/ui/button/Button';
import { apiDeleteIntegration } from '../../../../../hooks/useIntegration';
import type { ApiIntegration } from '@nangohq/types';
import { useToast } from '../../../../../hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../../../components/ui/Dialog';
import { clearConnectionsCache } from '../../../../../hooks/useConnections';

export const DeleteIntegrationButton: React.FC<{ env: string; integration: ApiIntegration }> = ({ env, integration }) => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const { mutate, cache } = useSWRConfig();

    const onDelete = async () => {
        setLoading(true);

        const deleted = await apiDeleteIntegration(env, integration.unique_key);

        setLoading(false);
        if ('error' in deleted.json) {
            toast({ title: deleted.json.error.message || 'Failed to delete, an error occurred', variant: 'error' });
        } else {
            toast({ title: `Integration "${integration.unique_key}" has been deleted`, variant: 'success' });
            void mutate((key) => typeof key === 'string' && key.startsWith(`/api/v1/integrations`), undefined);

            clearConnectionsCache(cache, mutate);

            navigate(`/${env}/integrations`);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button type="button" variant={'danger'} isLoading={loading}>
                    Delete
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Delete integration?</DialogTitle>
                <DialogDescription>
                    You are about to permanently delete this integration, all of its associated connections and records. This operation is not reversible, are
                    you sure you wish to continue?
                </DialogDescription>
                <DialogFooter className="mt-4">
                    <DialogClose asChild>
                        <Button variant={'zinc'}>Cancel</Button>
                    </DialogClose>
                    <Button variant={'danger'} onClick={onDelete} isLoading={loading}>
                        Delete integration, connections and records
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
