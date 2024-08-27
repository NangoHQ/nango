// Generated by ts-to-zod
// eslint-disable-next-line import/no-extraneous-dependencies
import { z } from 'zod';

export const exactCustomerSchema = z.object({
    id: z.string(),
    division: z.number().nullable(),
    name: z.string(),
    email: z.string().nullable(),
    taxNumber: z.string().nullable(),
    addressLine1: z.string().nullable(),
    addressLine2: z.string().nullable(),
    city: z.string().nullable(),
    zip: z.string().nullable(),
    country: z.string().nullable(),
    state: z.string().nullable(),
    phone: z.string().nullable()
});

export const exactCustomerCreateBaseSchema = z.object({
    name: z.string(),
    email: z.string().optional().nullable(),
    taxNumber: z.string().optional().nullable(),
    addressLine1: z.string().optional().nullable(),
    addressLine2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    zip: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    phone: z.string().optional().nullable()
});

export const exactCustomerCreateInputSchema = z.object({
    name: z.string(),
    email: z.string().optional().nullable(),
    taxNumber: z.string().optional().nullable(),
    addressLine1: z.string().optional().nullable(),
    addressLine2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    zip: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    phone: z.string().optional().nullable()
});

export const exactCustomerCreateOutputSchema = z.object({
    id: z.string()
});

export const exactCustomerUpdateInputSchema = z.object({
    name: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    taxNumber: z.string().optional().nullable(),
    addressLine1: z.string().optional().nullable(),
    addressLine2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    zip: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    id: z.string()
});

export const exactCustomerUpdateOutputSchema = z.object({
    success: z.boolean()
});

export const exactPaymentSchema = z.object({
    id: z.string(),
    description: z.string().nullable(),
    division: z.number().nullable(),
    customerId: z.string().nullable(),
    amount: z.number().nullable(),
    createdAt: z.string().nullable(),
    currency: z.string().nullable(),
    journal: z.string().nullable(),
    paymentMethod: z.string().nullable(),
    paymentReference: z.string().nullable(),
    status: z.number().nullable(),
    transactionID: z.string().nullable()
});

export const exactInvoiceLineSchema = z.object({
    itemId: z.string(),
    quantity: z.number(),
    amountNet: z.number(),
    vatCode: z.string().optional(),
    description: z.string().optional()
});

export const exactInvoiceCreateInputSchema = z.object({
    customerId: z.string(),
    journal: z.number().optional(),
    currency: z.literal('EUR').optional(),
    description: z.string().optional(),
    createdAt: z.date().optional(),
    lines: z.array(exactInvoiceLineSchema)
});

export const exactInvoiceCreateOutputSchema = z.object({
    id: z.string()
});

export const exactInvoiceUpdateInputSchema = z.object({
    id: z.string(),
    deliverTo: z.string().optional(),
    currency: z.literal('EUR').optional(),
    description: z.string().optional(),
    createdAt: z.date().optional()
});

export const exactInvoiceUpdateOutputSchema = z.object({
    success: z.boolean()
});

export const exactInvoiceAttachFileInputSchema = z.object({
    invoiceId: z.string(),
    customerId: z.string(),
    subject: z.string(),
    filename: z.string(),
    content: z.string()
});

export const exactInvoiceAttachFileOutputSchema = z.object({
    success: z.boolean()
});

export const exactInvoicePrintInputSchema = z.object({
    invoiceId: z.string()
});

export const exactInvoicePrintOutputSchema = z.object({
    success: z.boolean()
});