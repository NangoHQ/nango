import type { Payment } from '../../models';
import type { Payment as XeroPayment } from '../types';
import { parseDate } from '../utils.js';

export function toPayment(xeroPayment: XeroPayment): Payment {
    const payment: Payment = {
        id: xeroPayment.PaymentID,
        status: xeroPayment.Status,
        invoice_id: xeroPayment.Invoice ? xeroPayment.Invoice.InvoiceID : null,
        credit_note_id: xeroPayment.CreditNote ? xeroPayment.CreditNote.CreditNoteID : null,
        account_code: xeroPayment.Account.Code,
        account_id: xeroPayment.Account.AccountID,
        date: xeroPayment.Date ? parseDate(xeroPayment.Date).toISOString() : null,
        amount_cents: xeroPayment.Amount * 100
    };

    return payment;
}
