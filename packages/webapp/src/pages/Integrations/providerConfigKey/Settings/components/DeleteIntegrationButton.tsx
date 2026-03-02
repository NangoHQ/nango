import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';

import { clearConnectionsCache } from '../../../../../hooks/useConnections.js';
import { useDeleteIntegration } from '../../../../../hooks/useIntegration.js';
import { useToast } from '../../../../../hooks/useToast.js';
import { Button } from '@/components-v2/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog.js';

import type { ApiIntegration } from '@nangohq/types';

export const DeleteIntegrationButton: React.FC<{ env: string; integration: ApiIntegration; className?: string }> = ({ env, integration, className = '' }) => {
    const { toast } = useToast();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const { mutate, cache } = useSWRConfig();
    const { mutateAsync: deleteIntegration, isPending } = useDeleteIntegration(env, integration.unique_key);

    const onDelete = async () => {
        try {
            await deleteIntegration();
            toast({ title: `Integration "${integration.unique_key}" has been deleted`, variant: 'success' });
            clearConnectionsCache(cache, mutate);
            navigate(`/${env}/integrations`);
        } catch {
            toast({ title: 'Failed to delete integration', variant: 'error' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" size="lg" loading={isPending} className={className}>
                    <Trash2 />
                    Delete integration
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogTitle>Delete integration?</DialogTitle>
                <DialogDescription>
                    You are about to permanently delete this integration, all of its associated connections and records. This operation is not reversible, are
                    you sure you wish to continue?
                </DialogDescription>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary">Cancel</Button>
                    </DialogClose>
                    <Button variant="destructive" onClick={onDelete} disabled={isPending}>
                        Delete integration, connections and records
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
