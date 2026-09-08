import { Share } from 'lucide-react';
import { useRef, useState } from 'react';

import {
    Alert,
    AlertDescription,
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
import { track } from '@/utils/analytics';
import { openSupportChat } from '@/utils/support';
import { actionSelectionLabel, resourceSelectionLabel } from '../constants';
import { AUDIT_EXPORT_MAX_ROWS, exportWindowField } from '../export';

import type { AuditAction, AuditResource, AuditTrailTotal } from '@nangohq/types';

// Matches DialogContent's own `duration-200` exit animation.
const DIALOG_EXIT_MS = 200;

interface AuditExportDialogProps {
    /** Sent to the API. Its resources can be wider than the ones picked, since an action only matches paired with a resource. */
    query: { from: string | undefined; to: string | undefined; resources: AuditResource[]; actions: AuditAction[] };
    selection: { resources: AuditResource[]; actions: AuditAction[] };
    /** Absent when the count failed, in which case the cap has to be stated unconditionally. */
    total?: AuditTrailTotal | undefined;
    disabled?: boolean;
}

export const AuditExportDialog: React.FC<AuditExportDialogProps> = ({ query, selection, total, disabled }) => {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const exportButtonRef = useRef<HTMLButtonElement>(null);
    const openSupportOnClose = useRef(false);
    const windowField = exportWindowField(query.from, query.to);
    // A capped count knows only that the window is bigger than the cap, never by how much.
    const truncates = total ? total.relation === 'gte' || total.value > AUDIT_EXPORT_MAX_ROWS : undefined;
    const exportedCount = total && (truncates ? AUDIT_EXPORT_MAX_ROWS : total.value);

    const onContact = () => {
        openSupportOnClose.current = true;
        setIsOpen(false);
    };

    const onExport = async () => {
        setIsExporting(true);
        try {
            const { truncated } = await apiAuditTrailExport(query);
            track('web:audit:exported', { truncated });
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
                <Button variant="outline" size="md" disabled={disabled}>
                    <Share size={14} />
                    Export
                </Button>
            </DialogTrigger>
            <DialogContent
                onOpenAutoFocus={(event) => {
                    // Radix would otherwise land on the body's "Contact us" link, making Enter open support.
                    event.preventDefault();
                    exportButtonRef.current?.focus();
                }}
                onCloseAutoFocus={(event) => {
                    if (!openSupportOnClose.current) {
                        return;
                    }
                    openSupportOnClose.current = false;
                    // Radix would pull focus back to the Export trigger, and the focus trap and `aria-hidden`
                    // only come off with the content — so opening waits for the exit animation.
                    event.preventDefault();
                    setTimeout(openSupportChat, DIALOG_EXIT_MS);
                }}
            >
                <DialogHeader>
                    <DialogTitle>Export audit trail</DialogTitle>
                    <DialogDescription>Downloads the events matching these filters as a CSV file.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                    <dl className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2.5 text-body-small-regular">
                        <dt className="uppercase text-text-muted">{windowField.label}</dt>
                        <dd className="font-code text-text-primary">
                            {windowField.value}
                            {windowField.zone && <span className="text-text-muted"> {windowField.zone}</span>}
                        </dd>
                        <dt className="uppercase text-text-muted">Resource</dt>
                        <dd className="font-code text-text-primary">{resourceSelectionLabel(selection.resources)}</dd>
                        <dt className="uppercase text-text-muted">Action</dt>
                        <dd className="font-code text-text-primary">{actionSelectionLabel(selection.actions)}</dd>
                        {total && (
                            <>
                                <dt className="uppercase text-text-muted">Events</dt>
                                <dd className="font-code text-text-primary">
                                    {exportedCount?.toLocaleString()}
                                    {truncates && <span className="text-text-muted"> (max)</span>}
                                </dd>
                            </>
                        )}
                    </dl>
                    {truncates === true && (
                        <div className="mt-5">
                            <Alert variant="info" size="compact">
                                <AlertDescription>
                                    Your filters match more than the {AUDIT_EXPORT_MAX_ROWS.toLocaleString()} events a single export can hold. Narrow the date
                                    range or filters to export older events.
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                    {truncates === undefined && (
                        <p className="mt-5 text-body-small-regular text-text-secondary">An export stops at {AUDIT_EXPORT_MAX_ROWS.toLocaleString()} events.</p>
                    )}
                    <p className="mt-3 text-body-small-regular text-text-secondary">
                        Need a larger or scheduled export?{' '}
                        <Button variant="link-accent" size="sm" onClick={onContact}>
                            Contact us
                        </Button>
                        .
                    </p>
                </DialogBody>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline" size="sm" disabled={isExporting}>
                            Cancel
                        </Button>
                    </DialogClose>
                    <Button ref={exportButtonRef} size="sm" loading={isExporting} onClick={() => void onExport()}>
                        Export CSV
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
