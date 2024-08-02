import type { NangoAction, ExactInvoiceAttachFileOutput, ExactInvoiceAttachFileInput } from '../../models';
import type { E0_SalesInvoice, EO_Document, EO_DocumentAttachment, ResponsePostBody } from '../types';
import { getUser } from '../helpers/get-user.js';
import { exactInvoiceAttachFileInputSchema } from '../../schema.zod.js';

export default async function runAction(nango: NangoAction, input: ExactInvoiceAttachFileInput): Promise<ExactInvoiceAttachFileOutput> {
    const parsedInput = exactInvoiceAttachFileInputSchema.safeParse(input);
    if (!parsedInput.success) {
        throw new nango.ActionError({
            message: 'Invalid input',
            errors: parsedInput.error
        });
    }

    const { division } = await getUser(nango);

    // Create an empty document
    const bodyDocument: EO_Document = {
        Account: input.customerId,
        Subject: input.subject,
        Type: 183 // General Attachment, find the ids in your EO UI > Documents
    };
    const doc = await nango.post<ResponsePostBody<{ ID: string }>>({
        endpoint: `/api/v1/${division}/documents/Documents`,
        data: bodyDocument
    });

    const documentId = doc.data.d.ID;

    // Upload the file
    const bodyAttachment: EO_DocumentAttachment = {
        Attachment: input.content,
        Document: documentId,
        FileName: input.filename
    };
    await nango.post<ResponsePostBody<{ ID: string }>>({
        endpoint: `/api/v1/${division}/documents/DocumentAttachments`,
        data: bodyAttachment
    });

    // Attach the Document to an Invoice
    const bodyInvoice: Partial<E0_SalesInvoice> = {
        Document: documentId
    };
    await nango.put<ResponsePostBody<E0_SalesInvoice>>({
        endpoint: `/api/v1/${division}/salesinvoice/SalesInvoices(guid'${input.invoiceId}')`,
        data: bodyInvoice
    });

    return {
        success: true
    };
}
