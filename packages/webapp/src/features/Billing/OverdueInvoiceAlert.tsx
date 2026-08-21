import { CircleAlert } from 'lucide-react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import type { AlertProps } from '@nangohq/design-system';

interface OverdueInvoiceAlertProps {
    size?: AlertProps['size'];
    canManageBilling: boolean;
    children?: React.ReactNode;
}

export function OverdueInvoiceAlert({ size = 'compact', canManageBilling, children }: OverdueInvoiceAlertProps) {
    return (
        <Alert variant="danger" size={size}>
            <CircleAlert />
            <AlertTitle>Invoice(s) overdue</AlertTitle>
            <AlertDescription>{canManageBilling ? 'Pay it to avoid interruption.' : 'Reach out to an admin to get it resolved.'}</AlertDescription>
            {canManageBilling && children && <AlertActions>{children}</AlertActions>}
        </Alert>
    );
}
