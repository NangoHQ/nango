import type { NangoAction, ExactInvoiceUpdateOutput, ExactInvoiceUpdateInput } from '../../models';
import type { E0_SalesInvoice, ResponsePostBody } from '../types';
import { getUser } from '../helpers/get-user.js';
import { exactInvoiceUpdateInputSchema } from '../schema.zod.js';

export default async function runAction(nango: NangoAction, input: ExactInvoiceUpdateInput): Promise<ExactInvoiceUpdateOutput> {
    const parsedInput = exactInvoiceUpdateInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'Invalid input',
            errors: parsedInput.error
        });
    }

    const { division } = await getUser(nango);

    const body: Partial<E0_SalesInvoice> = {};
    if (input.deliverTo) {
        body.OrderedBy = input.deliverTo;
    }
    if (input.createdAt) {
        body.OrderDate = input.createdAt.toISOString();
    }
    if (input.description) {
        body.Description = input.description;
    }
    if (input.currency) {
        body.Currency = input.currency;
    }

    await nango.put<ResponsePostBody<E0_SalesInvoice>>({
        endpoint: `/api/v1/${division}/salesinvoice/SalesInvoices(guid'${input.id}')`,
        data: body
    });

    return {
        success: true
    };
}
