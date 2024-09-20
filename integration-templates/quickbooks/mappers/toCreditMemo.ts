import type { CreditMemo, CreateCreditMemo, UpdateCreditMemo } from '../../models';
import type { QuickBooksCreditMemo, LineInvoice } from '../types';
import { mapReference } from '../utils/mapRefrence.js';

/**
 * Converts a QuickBooksCreditMemo object to a CreditMemo object.
 * Only includes essential properties mapped from QuickBooksCreditMemo.
 * @param creditMemo The QuickBooksCreditMemo object to convert.
 * @returns CreditMemo object representing QuickBooks creditMemo information.
 */
export function toCreditMemo(creditMemo: QuickBooksCreditMemo): CreditMemo {
    return {
        created_at: new Date(creditMemo.MetaData?.CreateTime).toISOString(),
        updated_at: new Date(creditMemo.MetaData?.LastUpdatedTime).toISOString(),
        id: creditMemo.Id,
        txn_date: creditMemo.TxnDate,
        remaining_credit: creditMemo.RemainingCredit,
        balance_cents: (creditMemo.Balance || 0) * 100,
        total_amt_cents: (creditMemo.TotalAmt || 0) * 100,
        customer_name: creditMemo.CustomerRef.name ?? null,
        bill_address: creditMemo.BillAddr
            ? {
                  city: creditMemo.BillAddr.City ?? null,
                  line1: creditMemo.BillAddr.Line1 ?? null,
                  postal_code: creditMemo.BillAddr.PostalCode ?? null,
                  country: creditMemo.BillAddr.Country ?? null,
                  id: creditMemo.BillAddr.Id
              }
            : null,
        items: (creditMemo.Line || [])
            .filter((line: LineInvoice) => line.DetailType === 'SalesItemLineDetail')
            .map((line: LineInvoice) => ({
                id: line.Id,
                description: line.Description ?? null,
                qty: line.SalesItemLineDetail?.Qty ?? 0,
                unit_price_cents: (line.SalesItemLineDetail?.UnitPrice || 0) * 100,
                amount_cents: (line.Amount || 0) * 100
            }))
    };
}

/**
 * Maps the creditMemo data from the input format to the QuickBooks credit Memo structure.
 * This function checks for the presence of various fields in the creditMemo object and maps them
 * to the corresponding fields expected by QuickBooks.
 *
 * @param {CreateCreditMemo} creditMemo - The creditMemo data input object that needs to be mapped.
 * @returns {QuickBooksCreditMemo} - The mapped QuickBooks creditMemo object.
 */
export function toQuickBooksCreditMemo(creditMemo: CreateCreditMemo): QuickBooksCreditMemo {
    const quickBooksCreditMemo: Partial<QuickBooksCreditMemo> = {};

    // Handle update scenarios if applicable
    if ('id' in creditMemo && 'sync_token' in creditMemo) {
        const updateInvoice = creditMemo as UpdateCreditMemo;
        quickBooksCreditMemo.Id = updateInvoice.id;
        quickBooksCreditMemo.SyncToken = updateInvoice.sync_token;
        quickBooksCreditMemo.sparse = true;
    }

    const customerRef = mapReference(creditMemo.customer_ref);
    if (customerRef) {
        quickBooksCreditMemo.CustomerRef = customerRef;
    }

    if (creditMemo.line) {
        quickBooksCreditMemo.Line = creditMemo.line.map((line) => {
            const qbLine: Partial<LineInvoice> = {};
            qbLine.DetailType = line.detail_type;
            qbLine.Amount = line.amount_cents / 100;

            if (line.sales_item_line_detail) {
                qbLine.SalesItemLineDetail = {
                    ItemRef: {
                        value: line.sales_item_line_detail.item_ref.value,
                        name: line.sales_item_line_detail.item_ref.name ?? ''
                    }
                };

                if (line.quantity) {
                    qbLine.SalesItemLineDetail.Qty = line.quantity;
                }

                if (line.unit_price_cents) {
                    qbLine.SalesItemLineDetail.UnitPrice = line.unit_price_cents / 100;
                }
            }

            if (line.description) {
                qbLine.Description = line.description;
            }

            return qbLine as LineInvoice;
        });
    }

    const currencyRef = mapReference(creditMemo.currency_ref);
    if (currencyRef) {
        quickBooksCreditMemo.CurrencyRef = currencyRef;
    }

    const projectRef = mapReference(creditMemo.project_ref);
    if (projectRef) {
        quickBooksCreditMemo.ProjectRef = projectRef;
    }

    return quickBooksCreditMemo as QuickBooksCreditMemo;
}
