// eslint-disable-next-line import/no-extraneous-dependencies
import { z } from 'zod';

export const netsuiteCustomerCreateInputSchema = z.object({
    externalId: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    taxNumber: z.string().optional(),
    phone: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional()
});

export const netsuiteCustomerUpdateInputSchema = z.object({
    id: z.string().min(1),
    externalId: z.string().optional(),
    name: z.string().optional(),
    email: z.string().email(),
    taxNumber: z.string().optional(),
    phone: z.string().optional(),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    country: z.string().optional()
});

export const netsuiteCreditNoteCreateInputSchema = z.object({
    customerId: z.string().min(1),
    currency: z.string().min(1),
    description: z.string().optional(),
    status: z.string().min(1),
    lines: z.array(
        z.object({
            itemId: z.string().min(1),
            quantity: z.number().min(0),
            amount: z.number().min(0),
            vatCode: z.string().optional(),
            description: z.string().optional()
        })
    )
});
export const netsuiteCreditNoteUpdateInputSchema = z.object({
    id: z.string().min(1),
    customerId: z.string().min(1).optional(),
    currency: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.string().min(1).optional(),
    lines: z
        .array(
            z.object({
                itemId: z.string().min(1),
                quantity: z.number().min(0),
                amount: z.number().min(0),
                vatCode: z.string().optional(),
                description: z.string().optional()
            })
        )

        .optional()
});

export const netsuiteInvoiceCreateInputSchema = z.object({
    customerId: z.string().min(1),
    currency: z.string().min(1),
    description: z.string().optional(),
    status: z.string().min(1),
    lines: z.array(
        z.object({
            itemId: z.string().min(1),
            quantity: z.number().min(0),
            amount: z.number().min(0),
            vatCode: z.string().optional(),
            description: z.string().optional()
        })
    )
});
export const netsuiteInvoiceUpdateInputSchema = z.object({
    id: z.string().min(1),
    customerId: z.string().min(1).optional(),
    currency: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.string().min(1).optional(),
    lines: z
        .array(
            z.object({
                itemId: z.string().min(1),
                quantity: z.number().min(0),
                amount: z.number().min(0),
                vatCode: z.string().optional(),
                description: z.string().optional()
            })
        )

        .optional()
});

export const netsuitePaymentCreateInputSchema = z.object({
    customerId: z.string(),
    amount: z.number().min(0),
    currency: z.string(),
    paymentReference: z.string(),
    applyTo: z.array(z.string()),
    status: z.string(),
    description: z.string().optional()
});

export const netsuitePaymentUpdateInputSchema = z.object({
    id: z.string(),
    customerId: z.string().optional(),
    amount: z.number().min(0).optional(),
    currency: z.string().optional(),
    description: z.string().optional(),
    paymentReference: z.string().optional(),
    status: z.string().optional(),
    applyTo: z.array(z.string()).optional()
});
