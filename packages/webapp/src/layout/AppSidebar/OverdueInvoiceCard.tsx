import { TriangleAlert } from 'lucide-react';

import { StyledLink } from '@/components/ui/StyledLink';

interface OverdueInvoiceCardProps {
    portalUrl: string | null;
}

/**
 * Sidebar warning shown when the org has overdue invoices. Links out to the Orb
 * billing portal to edit the payment method. Rendered by AppSidebar on overdue
 * state (paying plans only — non-paying plans never poll for it).
 */
export default function OverdueInvoiceCard({ portalUrl }: OverdueInvoiceCardProps) {
    return (
        <div className="flex flex-col gap-1.5 px-3 py-3.5 text-xs rounded-sm bg-status-warning-bg text-status-warning-text">
            <div className="flex items-center gap-2 font-medium">
                <TriangleAlert className="size-4 shrink-0" />
                <span>Invoice(s) overdue</span>
            </div>
            <p>Edit payment method to avoid interruption.</p>
            {portalUrl && (
                <StyledLink to={portalUrl} icon type="external" variant="warning" size="sm">
                    Edit payment method
                </StyledLink>
            )}
        </div>
    );
}
