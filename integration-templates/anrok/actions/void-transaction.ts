import type { NangoAction, TransactionToDelete, TransactionDeletionActionResponse } from '../../models';

export default async function runAction(nango: NangoAction, rawInput: TransactionToDelete[]): Promise<TransactionDeletionActionResponse> {
    const response: TransactionDeletionActionResponse = {
        succeeded: [],
        failed: []
    };
    const input = Array.isArray(rawInput) ? rawInput : [rawInput];
    for (const transaction of input) {
        await nango
            .post({
                endpoint: `v1/seller/transactions/id:${transaction.id}/void`,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: {}
            })
            .then(() => {
                response.succeeded.push(transaction);
            })
            .catch((error) => {
                response.failed.push({
                    ...transaction,
                    validation_errors: error.response.data
                });
            });
    }
    return response;
}
