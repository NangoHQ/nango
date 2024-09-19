import type { Payment, CreatePayment } from '../../models';
import type { QuickBooksPayment } from '../types';
import { mapReference } from '../utils/mapRefrence.js';

/**
 * Converts a QuickBooksPayment object to a Payment object.
 * Only includes essential properties mapped from QuickBooksPayment.
 * @param customer The QuickBooksPayment object to convert.
 * @returns Payment object representing QuickBooks payment information.
 */
export function toPayment(quickBooksPayment: QuickBooksPayment): Payment {
    const payment: Payment = {
        id: quickBooksPayment.Id,
        amount_cents: Math.round(quickBooksPayment.TotalAmt * 100),
        customer_name: quickBooksPayment.CustomerRef.name ?? null,
        txn_date: quickBooksPayment.TxnDate,
        created_at: new Date(quickBooksPayment.MetaData.CreateTime).toISOString(),
        updated_at: new Date(quickBooksPayment.MetaData.LastUpdatedTime).toISOString()
    };

    return payment;
}

/**
 * Maps the payment data from the input format to the QuickBooks payment structure.
 * This function checks for the presence of various fields in the payment object and maps them
 * to the corresponding fields expected by QuickBooks.
 *
 * @param {CreatePayment} payment - The payment data input object that needs to be mapped.
 * @returns {QuickBooksPayment} - The mapped QuickBooks payment object.
 */
export function toQuickBooksPayment(payment: CreatePayment): QuickBooksPayment {
    const quickBooksPayment: Partial<QuickBooksPayment> = {};

    const customerRef = mapReference(payment.customer_ref);
    if (customerRef) {
        quickBooksPayment.CustomerRef = customerRef;
    }

    if (payment.total_amount_cents) {
        quickBooksPayment.TotalAmt = payment.total_amount_cents / 100;
    }

    const currencyRef = mapReference(payment.currency_ref);
    if (currencyRef) {
        quickBooksPayment.CurrencyRef = currencyRef;
    }

    const projectRef = mapReference(payment.project_ref);
    if (projectRef) {
        quickBooksPayment.ProjectRef = projectRef;
    }

    return quickBooksPayment as QuickBooksPayment;
}
