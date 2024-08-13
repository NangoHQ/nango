import type { NangoAction, TransactionNegationActionResponse, TransactionToNegate } from '../../models';
import { errorToObject } from '../utils.js';

export default async function runAction(nango: NangoAction, rawInput: TransactionToNegate[]): Promise<TransactionNegationActionResponse> {
    const response: TransactionNegationActionResponse = {
        succeeded: [],
        failed: []
    };
    const input = Array.isArray(rawInput) ? rawInput : [rawInput];

    for (const transaction of input) {
        const negation = {
            originalTransactionId: transaction.id,
            newTransactionId: transaction.voided_id
        };

        try {
            await nango.post({
                endpoint: `v1/seller/transactions/createNegation`,
                data: negation
            });
            const successTransaction = {
                ...transaction
            };
            response.succeeded.push(successTransaction);
        } catch (err) {
            response.failed.push({
                ...transaction,
                validation_errors: errorToObject(err)
            });
        }
    }
    return response;
}
