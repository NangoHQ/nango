import type { NangoSync, ExactPayment } from '../../models';
import type { EO_Payment } from '../types';
import { getUser } from '../helpers/get-user.js';

export default async function fetchData(nango: NangoSync): Promise<void> {
    const { division } = await getUser(nango);

    // List the accounts inside the user's Division
    for await (const paymentItems of nango.paginate<EO_Payment>({
        endpoint: `/api/v1/${division}/crm/Payments`,
        headers: { accept: 'application/json' },
        paginate: { response_path: 'd.results' },
        retries: 10
    })) {
        await nango.log('Listed', { total: paymentItems.length });

        const payments = paymentItems.map<ExactPayment>((payment) => {
            const tmp: ExactPayment = {
                id: payment.ID,
                description: payment.Description,
                division: payment.Division,
                customerId: payment.Account,
                amount: payment.AmountFC,
                createdAt: payment.Created,
                currency: payment.Currency,
                journal: payment.Journal,
                paymentMethod: payment.PaymentMethod,
                paymentReference: payment.PaymentReference,
                status: payment.Status,
                transactionID: payment.TransactionID
            };
            return tmp;
        });
        await nango.batchSave<ExactPayment>(payments, 'ExactPayment');
    }
}
