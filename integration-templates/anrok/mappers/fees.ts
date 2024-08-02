import type { TaxBreakdown, TransactionFee, TransactionFeeWithTaxBreakdown } from '../../models';
import type { AnrokJuris, AnrokLineItem } from '../types';

export function mapFees(fees: TransactionFee[], lineItems: AnrokLineItem[]): TransactionFeeWithTaxBreakdown[] {
    return fees.map((fee, i) => {
        const taxBreakdown: TaxBreakdown[] = [];

        const jursis: AnrokJuris[] = lineItems[i]?.jurises || [];
        for (const juris of jursis) {
            if (juris.taxes) {
                for (const tax of juris.taxes) {
                    taxBreakdown.push({
                        name: tax.taxName,
                        rate: tax.taxRate,
                        tax_amount: Number(tax.taxAmount)
                    });
                }
            } else if (juris.notTaxedReason) {
                taxBreakdown.push({
                    reason: juris.notTaxedReason.reason.type,
                    type: juris.notTaxedReason.type
                });
            }
        }
        return {
            ...fee,
            amount_cents: lineItems[i]?.preTaxAmount ? Number(lineItems[i]?.preTaxAmount) : 0,
            tax_amount_cents: lineItems[i]?.taxAmountToCollect || 0,
            tax_breakdown: taxBreakdown
        };
    });
}
