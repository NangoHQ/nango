import type { NangoAction, TransactionActionResponse, Transaction, SuccessTransaction, AnrokTransactionData } from '../../models';

import type { AnrokResponse } from '../types';
import { mapFees } from '../mappers/fees.js';
import { errorToObject } from '../utils.js';

export default async function runAction(nango: NangoAction, rawInput: Transaction[]): Promise<TransactionActionResponse> {
    const response: TransactionActionResponse = {
        succeeded: [],
        failed: []
    };

    const input = Array.isArray(rawInput) ? rawInput : [rawInput];

    for (const transaction of input) {
        const anrokTransaction: AnrokTransactionData = {
            id: transaction.id,
            accountingDate: transaction.issuing_date,
            currencyCode: transaction.currency,
            customerId: transaction.contact.external_id,
            customerName: transaction.contact.name,
            customerAddress: {
                line1: transaction.contact.address_line_1,
                city: transaction.contact.city,
                postalCode: transaction.contact.zip,
                country: transaction.contact.country
            },
            lineItems: transaction.fees.map((fee) => ({
                id: fee.item_id,
                productExternalId: fee.item_code || '',
                amount: fee.amount_cents || 0
            }))
        };

        if (transaction.contact.taxable && transaction.contact.tax_number) {
            anrokTransaction.customerTaxIds = [
                {
                    type: 'genericVatNumber',
                    value: transaction.contact.tax_number
                }
            ];
        }

        try {
            const res = await nango.post<AnrokResponse>({
                endpoint: 'v1/seller/transactions/createOrUpdate',
                data: anrokTransaction
            });
            const { preTaxAmount, taxAmountToCollect, lineItems } = res.data;
            const transactionResponse: SuccessTransaction = {
                ...transaction,
                sub_total_excluding_taxes: Number(preTaxAmount),
                taxes_amount_cents: taxAmountToCollect,
                fees: mapFees(transaction.fees, lineItems)
            };

            response.succeeded.push(transactionResponse);
        } catch (err) {
            response.failed.push({
                ...transaction,
                validation_errors: errorToObject(err)
            });
        }
    }
    return response;
}
