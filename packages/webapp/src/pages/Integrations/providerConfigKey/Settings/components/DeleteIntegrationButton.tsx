import { Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSWRConfig } from 'swr';

import { clearConnectionsCache } from '../../../../../hooks/useConnections.js';
import { apiDeleteIntegration } from '../../../../../hooks/useIntegration.js';
import { useToast } from '../../../../../hooks/useToast.js';
import { Button } from '@/components-v2/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components-v2/ui/dialog.js';

import type { ApiIntegration } from '@nangohq/types';

export const DeleteIntegrationButton: React.FC<{ env: string; integration: ApiIntegration; className?: string }> = ({ env, integration, className = '' }) => {
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
                <Button variant="destructive" size="lg" disabled={loading} className={className}>
                    {loading ? <Loader2 className="animate-spin" /> : <Trash2 />}
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
                    <Button variant="destructive" onClick={onDelete} disabled={loading}>
                        {loading && <Loader2 className="animate-spin" />}
                        Delete integration, connections and records
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
