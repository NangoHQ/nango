import { CircleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import type { AlertProps } from '@nangohq/design-system';

interface OverdueInvoiceAlertProps {
    size?: AlertProps['size'];
    /** Actions differ per context: the Billing page opens the Stripe dialog, the sidebar links to it. */
    children?: React.ReactNode;
}

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
