import type { NangoAction, NetsuiteInvoiceUpdateInput, NetsuiteInvoiceUpdateOutput } from '../../models';
import type { NS_Invoice } from '../types';
import { netsuiteInvoiceUpdateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuiteInvoiceUpdateInput): Promise<NetsuiteInvoiceUpdateOutput> {
    const parsedInput = netsuiteInvoiceUpdateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'invalid credit note input',
            errors: parsedInput.error
        });
    }

    const lines = input.lines?.map((line) => {
        return {
            item: { id: line.itemId, refName: line.description || '' },
            quantity: line.quantity,
            amount: line.amount,
            ...(line.vatCode && { taxDetailsReference: line.vatCode })
        };
    });

    const body: Partial<NS_Invoice> = {
        id: input.id,
        ...(input.customerId && { entity: { id: input.customerId } }),
        ...(input.status && { status: { id: input.status } }),
        ...(input.currency && { currency: { refName: input.currency } }),
        ...(input.description && { memo: input.description }),
        ...(lines && { item: { items: lines } })
    };
    await nango.patch({
        endpoint: '/invoice',
        data: body
    });
    return { success: true };
}
