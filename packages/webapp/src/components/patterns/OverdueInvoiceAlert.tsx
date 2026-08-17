import { CircleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import type { AlertProps } from '@nangohq/design-system';

interface OverdueInvoiceAlertProps {
    /** `compact` drops the actions below the text for the narrow sidebar; `wide` keeps them inline. */
    size?: AlertProps['size'];
    /**
     * Actions are supplied by the caller because they differ by context: the Billing page opens the
     * Stripe dialog in place, while the sidebar — which renders app-wide — links to that page instead.
     */
    children?: React.ReactNode;
}

/**
 * Shown when the org has overdue invoices. Rendered in the sidebar and above the Billing & usage page.
 *
 * Intentionally has no `onDismiss`: an unpaid invoice stays true until it's paid, so the warning
 * should persist rather than be closable.
 */
export function OverdueInvoiceAlert({ size = 'compact', children }: OverdueInvoiceAlertProps) {
    return (
        <Alert variant="danger" size={size}>
            <CircleAlert />
            <AlertTitle>Invoice(s) overdue</AlertTitle>
            <AlertDescription>Edit payment method to avoid interruption.</AlertDescription>
            {children && <AlertActions>{children}</AlertActions>}
        </Alert>
    );
}
