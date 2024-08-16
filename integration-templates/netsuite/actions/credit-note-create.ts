import type { NangoAction, NetsuiteCreditNoteCreateInput, NetsuiteCreditNoteCreateOutput } from '../../models';
import type { NS_CreditNote } from '../types';
import { netsuiteCreditNoteCreateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: NetsuiteCreditNoteCreateInput): Promise<NetsuiteCreditNoteCreateOutput> {
    const parsedInput = netsuiteCreditNoteCreateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'invalid credit note input',
            errors: parsedInput.error
        });
    }

    const body: Partial<NS_CreditNote> = {
        entity: { id: input.customerId },
        status: { id: input.status },
        ...(input.currency && { currency: { refName: input.currency } }),
        ...(input.description && { memo: input.description }),
        item: {
            items: input.lines.map((line) => ({
                item: { id: line.itemId, refName: line.description || '' },
                quantity: line.quantity,
                amount: line.amount,
                ...(line.vatCode && { taxDetailsReference: line.vatCode })
            }))
        }
    };
    const res = await nango.post({
        endpoint: '/creditmemo',
        data: body
    });
    const id = res.headers.location?.split('/').pop();
    if (!id) {
        throw new nango.ActionError({
            message: "Error creating credit note: could not parse 'id' from Netsuite API response"
        });
    }
    return { id };
}
