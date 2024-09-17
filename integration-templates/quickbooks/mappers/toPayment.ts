import type { Payment, CreatePayment } from '../../models';
import type { QuickBooksPayment } from '../types';

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
    const quickBooksPayment: any = {};

    if (payment.customer_ref) {
        quickBooksPayment.CustomerRef = {
            value: payment.customer_ref.value,
            name: payment.customer_ref.name
        };
    }

    if (payment.total_amount_cents) {
        quickBooksPayment.TotalAmt = payment.total_amount_cents / 100;
    }

    if (payment.currency_ref) {
        quickBooksPayment.CurrencyRef = {
            value: payment.currency_ref.value,
            name: payment.currency_ref.name
        };
    }

    if (payment.project_ref) {
        quickBooksPayment.ProjectRef = {
            value: payment.project_ref.value,
            name: payment.project_ref.name
        };
    }

    return quickBooksPayment;
}
