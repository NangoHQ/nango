import type { Invoice, UpdateInvoice, CreateInvoice, InvoiceFee } from '../../models';
import type { Invoice as XeroInvoice, LineItem as XeroLineItem } from '../types';
import { parseDate } from '../utils.js';

export function toInvoice(xeroInvoice: XeroInvoice): Invoice {
    const invoice: Invoice = {
        id: xeroInvoice.InvoiceID,
        type: xeroInvoice.Type,
        external_contact_id: xeroInvoice.Contact.ContactID,
        status: xeroInvoice.Status ?? null,
        issuing_date: xeroInvoice.Date ? parseDate(xeroInvoice.Date).toISOString() : null,
        payment_due_date: xeroInvoice.DueDate ? parseDate(xeroInvoice.DueDate).toISOString() : null,
        number: xeroInvoice.InvoiceNumber,
        currency: xeroInvoice.CurrencyCode,
        purchase_order: null,
        fees: xeroInvoice.LineItems.map(toInvoiceItem)
    };

    if (xeroInvoice.Url) {
        invoice.url = xeroInvoice.Url;
    }

    return invoice;
}

function toInvoiceItem(xeroInvoiceItem: XeroLineItem): InvoiceFee {
    const item: InvoiceFee = {
        item_id: xeroInvoiceItem.LineItemID,
        item_code: xeroInvoiceItem.ItemCode,
        description: xeroInvoiceItem.Description,
        units: Number(xeroInvoiceItem.Quantity) || null,
        precise_unit_amount: Number(xeroInvoiceItem.UnitAmount) || null,
        account_code: xeroInvoiceItem.AccountCode,
        account_external_id: xeroInvoiceItem.AccountId,
        amount_cents: xeroInvoiceItem.LineAmount ? Math.round(parseFloat(xeroInvoiceItem.LineAmount) * 100) : null,
        taxes_amount_cents: xeroInvoiceItem.TaxAmount ? Math.round(parseFloat(xeroInvoiceItem.TaxAmount) * 100) : null
    };

    if (xeroInvoiceItem.DiscountRate) {
        item.discount_rate = xeroInvoiceItem.DiscountRate;
    }

    if (xeroInvoiceItem.DiscountAmount) {
        item.discount_amount_cents = Math.round(xeroInvoiceItem.DiscountAmount * 100);
    }

    return item;
}

export function toXeroInvoice(invoice: UpdateInvoice | CreateInvoice) {
    const xeroInvoice: Record<string, any> = {
        Type: invoice.type,
        Contact: {
            ContactID: invoice.external_contact_id
        },
        LineItems: []
    };

    if ('id' in invoice) {
        xeroInvoice['InvoiceID'] = invoice.id;
    }

    if (invoice.number) {
        xeroInvoice['InvoiceNumber'] = invoice.number;
    }

    if (invoice.status) {
        xeroInvoice['Status'] = invoice.status;
    }

    if (invoice.currency) {
        xeroInvoice['CurrencyCode'] = invoice.currency;
    }

    if (invoice.issuing_date) {
        const issuingDate = new Date(invoice.issuing_date);
        xeroInvoice['Date'] = issuingDate.toISOString().split('T')[0];
    }

    if (invoice.payment_due_date) {
        const dueDate = new Date(invoice.payment_due_date);
        xeroInvoice['DueDate'] = dueDate.toISOString().split('T')[0];
    }

    if (invoice.url) {
        xeroInvoice['Url'] = invoice.url;
    }

    if (invoice.fees) {
        for (const item of invoice.fees) {
            const xeroItem: Record<string, any> = {
                Description: item.description,
                AccountCode: item.account_code
            };

            if ('item_id' in item) {
                xeroItem['LineItemID'] = item.item_id;
            }

            if (item.item_code) {
                xeroItem['ItemCode'] = item.item_code;
            }

            if (item.units) {
                xeroItem['Quantity'] = item.units;
            }

            if (item.precise_unit_amount) {
                xeroItem['UnitAmount'] = item.precise_unit_amount;
            }

            if (item.amount_cents) {
                xeroItem['LineAmount'] = (item.amount_cents / 100).toFixed(2);
            }

            if (item.taxes_amount_cents) {
                xeroItem['TaxAmount'] = (item.taxes_amount_cents / 100).toFixed(2);
            }

            if (item.discount_amount_cents) {
                xeroItem['DiscountAmount'] = (item.discount_amount_cents / 100).toFixed(2);
            }

            if (item.discount_rate) {
                xeroItem['DiscountRate'] = item.discount_rate;
            }

            xeroInvoice['LineItems'].push(xeroItem);
        }
    }

    return xeroInvoice;
}
