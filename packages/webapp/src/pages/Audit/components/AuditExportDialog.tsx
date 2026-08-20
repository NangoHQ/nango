import { Download } from 'lucide-react';
import { useState } from 'react';

import {
    Button,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@nangohq/design-system';

import { apiAuditTrailExport } from '@/hooks/useAudit';
import { useToast } from '@/hooks/useToast';
import { AUDIT_EXPORT_MAX_ROWS, exportFilterLabel, exportWindowLabel } from '../export';

import type { AuditAction, AuditResource } from '@nangohq/types';

interface AuditExportDialogProps {
    from: string | undefined;
    to: string | undefined;
    resources: AuditResource[];
    actions: AuditAction[];
    disabled?: boolean;
}

export const AuditExportDialog: React.FC<AuditExportDialogProps> = ({ from, to, resources, actions, disabled }) => {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const onExport = async () => {
        setIsExporting(true);
        try {
            const { truncated } = await apiAuditTrailExport({ from, to, resources, actions });
            setIsOpen(false);
            toast(
                truncated
                    ? {
                          title: `Exported the first ${AUDIT_EXPORT_MAX_ROWS.toLocaleString()} events`,
                          description: 'There are more events in this window. Narrow the window or filters, or contact us for a full export.',
                          variant: 'warning'
                      }
                    : { title: 'Audit trail exported', variant: 'success' }
            );
        } catch {
            toast({ title: 'Failed to export the audit trail', variant: 'error' });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" disabled={disabled}>
                    <Download />
                    Export
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Export audit trail</DialogTitle>
                    <DialogDescription>The window and filters selected on the page are what gets exported.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <div className="flex flex-col gap-3 text-body-small-regular text-text-secondary">
                        <p className="text-text-primary">
                            Exports up to {AUDIT_EXPORT_MAX_ROWS.toLocaleString()} events as CSV, covering {exportWindowLabel(from, to)}, filtered by{' '}
                            {exportFilterLabel(resources, actions)}.
                        </p>
                        <p>
                            The file is built while you wait, so it is capped at {AUDIT_EXPORT_MAX_ROWS.toLocaleString()} events. If the window holds more, the
                            export stops there and we will tell you — narrow the window or the filters to get the rest.
                        </p>
                        <p>Need a larger export, or a scheduled one? Contact us and we will arrange it.</p>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" size="sm" disabled={isExporting}>
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button size="sm" loading={isExporting} onClick={() => void onExport()}>
                        Export CSV
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
