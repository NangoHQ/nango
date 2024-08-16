import type { NangoAction, NetsuitePaymentUpdateInput, NetsuitePaymentUpdateOutput } from '../../models';
import type { NS_Payment } from '../types';
import { netsuitePaymentUpdateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuitePaymentUpdateInput): Promise<NetsuitePaymentUpdateOutput> {
    const parsedInput = netsuitePaymentUpdateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'Invalid payment input',
            errors: parsedInput.error
        });
    }

    const body: Partial<NS_Payment> = {
        id: input.id,
        ...(input.customerId && { customer: { id: input.customerId } }),
        ...(input.amount && { payment: input.amount }),
        ...(input.currency && { currency: { refName: input.currency } }),
        ...(input.paymentReference && { tranId: input.paymentReference }),
        ...(input.status && { status: { id: input.status } }),
        ...(input.applyTo && { apply: { items: input.applyTo.map((id) => ({ doc: id })) } }),
        ...(input.description && { memo: input.description })
    };

    await nango.patch({
        endpoint: '/customerpayment',
        data: body
    });

    return { success: true };
}
