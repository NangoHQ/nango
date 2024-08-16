import type { NangoAction, NetsuiteCreditNoteUpdateInput, NetsuiteCreditNoteUpdateOutput } from '../../models';
import type { NS_CreditNote } from '../types';
import { netsuiteCreditNoteUpdateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuiteCreditNoteUpdateInput): Promise<NetsuiteCreditNoteUpdateOutput> {
    const parsedInput = netsuiteCreditNoteUpdateInputSchema.safeParse(input);
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

    const body: Partial<NS_CreditNote> = {
        id: input.id,
        ...(input.customerId && { entity: { id: input.customerId } }),
        ...(input.status && { status: { id: input.status } }),
        ...(input.currency && { currency: { refName: input.currency } }),
        ...(input.description && { memo: input.description }),
        ...(lines && { item: { items: lines } })
    };
    await nango.patch({
        endpoint: '/creditmemo',
        data: body
    });
    return { success: true };
}
