import type { NangoAction, NetsuiteInvoiceUpdateInput, NetsuiteInvoiceUpdateOutput } from '../../models';
import type { NS_Invoice, NS_Item } from '../types';
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
        const item: NS_Item = {
            item: { id: line.itemId, refName: line.description || '' },
            quantity: line.quantity,
            amount: line.amount
        };
        if (line.vatCode) {
            item.taxDetailsReference = line.vatCode;
        }
        return item;
    });

    const body: Partial<NS_Invoice> = {
        id: input.id
    };
    if (input.customerId) {
        body.entity = { id: input.customerId };
    }
    if (input.status) {
        body.status = { id: input.status };
    }
    if (input.currency) {
        body.currency = { refName: input.currency };
    }
    if (input.description) {
        body.memo = input.description;
    }
    if (lines) {
        body.item = { items: lines };
    }
    await nango.patch({
        endpoint: '/invoice',
        data: body
    });
    return { success: true };
}
