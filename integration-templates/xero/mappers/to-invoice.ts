import type { Invoice, InvoiceFee } from '../../models';
import { parseDate } from '../utils.js';

export function toInvoice(xeroInvoice: any): Invoice {
    return {
        id: xeroInvoice.InvoiceID,
        type: xeroInvoice.Type,
        external_contact_id: xeroInvoice.Contact.ContactID,
        status: xeroInvoice.Status,
        issuing_date: xeroInvoice.Date ? parseDate(xeroInvoice.Date) : null,
        payment_due_date: xeroInvoice.DueDate ? parseDate(xeroInvoice.DueDate) : null,
        number: xeroInvoice.InvoiceNumber,
        currency: xeroInvoice.CurrencyCode,
        purchase_order: null,
        fees: xeroInvoice.LineItems.map(toInvoiceItem)
    } as Invoice;
}

function toInvoiceItem(xeroInvoiceItem: any): InvoiceFee {
    return {
        item_id: xeroInvoiceItem.LineItemID,
        item_code: xeroInvoiceItem.ItemCode,
        description: xeroInvoiceItem.Description,
        units: xeroInvoiceItem.Quantity,
        precise_unit_amount: xeroInvoiceItem.UnitAmount,
        account_code: xeroInvoiceItem.AccountCode,
        account_external_id: xeroInvoiceItem.AccountId,
        amount_cents: parseFloat(xeroInvoiceItem.LineAmount) * 100, // Amounts in xero are not in cents
        taxes_amount_cents: parseFloat(xeroInvoiceItem.TaxAmount) * 100 // Amounts in xero are not in cents
    } as InvoiceFee;
}
