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
        id: input.id
    };
    if (input.customerId) {
        body.customer = { id: input.customerId };
    }
    if (input.amount) {
        body.payment = input.amount;
    }
    if (input.currency) {
        body.currency = { refName: input.currency };
    }
    if (input.paymentReference) {
        body.tranId = input.paymentReference;
    }
    if (input.status) {
        body.status = { id: input.status };
    }
    if (input.applyTo) {
        body.apply = { items: input.applyTo.map((id) => ({ doc: { id } })) };
    }
    if (input.description) {
        body.memo = input.description;
    }

    await nango.patch({
        endpoint: '/customerpayment',
        data: body
    });

    return { success: true };
}
