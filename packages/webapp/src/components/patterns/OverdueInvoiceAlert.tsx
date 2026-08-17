import { CircleAlert, ExternalLink } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';

import type { AlertProps } from '@nangohq/design-system';

interface OverdueInvoiceAlertProps {
    portalUrl: string | null;
    /** `compact` drops the CTA below the text for the narrow sidebar; `wide` keeps it inline. */
    size?: AlertProps['size'];
}

/**
 * Shown when the org has overdue invoices, linking out to the Orb billing portal to edit the
 * payment method. Rendered in the sidebar and above the Billing & usage page.
 *
 * Intentionally has no `onDismiss`: an unpaid invoice stays true until it's paid, so the warning
 * should persist rather than be closable.
 */
export function OverdueInvoiceAlert({ portalUrl, size = 'compact' }: OverdueInvoiceAlertProps) {
    return (
        <Alert variant="danger" size={size}>
            <CircleAlert />
            <AlertTitle>Invoice(s) overdue</AlertTitle>
            <AlertDescription>Edit payment method to avoid interruption.</AlertDescription>
            {portalUrl && (
                <AlertActions>
                    <AlertButtonLink to={portalUrl} target="_blank">
                        Edit payment method <ExternalLink />
                    </AlertButtonLink>
                </AlertActions>
            )}
        </Alert>
    );
}
