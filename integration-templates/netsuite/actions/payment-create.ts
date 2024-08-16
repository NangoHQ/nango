import type { NangoAction, NetsuitePaymentCreateInput, NetsuitePaymentCreateOutput } from '../../models';
import type { NS_Payment } from '../types';
import { netsuitePaymentCreateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuitePaymentCreateInput): Promise<NetsuitePaymentCreateOutput> {
    const parsedInput = netsuitePaymentCreateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'Invalid payment input',
            errors: parsedInput.error
        });
    }

    const body: Partial<NS_Payment> = {
        customer: { id: input.customerId },
        payment: input.amount,
        currency: { id: input.currency },
        tranId: input.paymentReference,
        status: { id: input.status },
        apply: { items: input.applyTo.map((id) => ({ doc: id })) },
        ...(input.description && { memo: input.description })
    };

    const res = await nango.post({
        endpoint: '/customerpayment',
        data: body
    });

    // Extract payment ID from response
    const id = res.headers.location?.split('/').pop();
    if (!id) {
        throw new nango.ActionError({
            message: "Error creating payment: could not parse 'id' from Netsuite API response"
        });
    }

    return { id };
}
