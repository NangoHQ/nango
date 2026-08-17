import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Badge, Button, Card, Input } from '@nangohq/design-system';

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePutBillingInvoicingDetails } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { countryCodes, taxIdTypes } from '../invoicingConstants';
import { InvoicingAddressFields } from './InvoicingAddressFields';
import { parseEmailTokens } from './invoicingEmails';
import { InvoicingEmailsField } from './InvoicingEmailsField';
import { toFormData } from './invoicingFormData.js';
import { InvoicingTaxIdFields } from './InvoicingTaxIdFields';

import type { BillingCustomer } from '@nangohq/types';

export const OptionalTag = () => <Badge variant="secondary">Optional</Badge>;

const countryValues = countryCodes.map((c) => c.value) as [string, ...string[]];
const taxIdTypeValues = taxIdTypes.map((t) => t.value) as [string, ...string[]];

const addressSchema = z.object({
    line1: z.string().nullable(),
    line2: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.enum(countryValues, { message: 'Valid country required' })
});

const taxIdSchema = z.object({
    country: z.enum(countryValues, { message: 'Valid country required' }),
    type: z.enum(taxIdTypeValues, { message: 'Valid tax ID type required' }),
    value: z.string().min(1, 'Required')
});

const schema = z
    .object({
        legalEntityName: z.string().min(1, 'Required'),
        emails: z
            .array(z.string().email('Invalid email address'))
            .min(1, 'At least one billing email required')
            .max(50, 'Maximum 50 billing email addresses')
            .refine((emails) => new Set(emails.map((email) => email.toLowerCase())).size === emails.length, 'Duplicate billing email address'),
        // Uncommitted chip-input text; not sent to the API, just fails validation so Save can't drop it.
        emailsDraft: z.string().optional(),
        address: addressSchema.nullable(),
        taxId: taxIdSchema.nullable()
    })
    .superRefine((data, ctx) => {
        const draft = (data.emailsDraft ?? '').trim();
        if (!draft) return;

        if (!z.string().email().safeParse(draft).success) {
            ctx.addIssue({ code: 'custom', path: ['emails'], message: `Invalid email address: ${draft}` });
        } else if (data.emails.some((email) => email.toLowerCase() === draft.toLowerCase())) {
            ctx.addIssue({ code: 'custom', path: ['emails'], message: `Already added: ${draft}` });
        }
    });

export type InvoicingFormData = z.infer<typeof schema>;

export const InvoicingDetailsForm: React.FC<{
    customer: BillingCustomer | undefined;
    paymentMethodSection: React.ReactNode;
    isLoading: boolean;
}> = ({ customer, paymentMethodSection, isLoading }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: putAsync, isPending } = usePutBillingInvoicingDetails(env);
    const formRef = useRef<HTMLFormElement>(null);
    // Scrolls to the form's end (past Save changes), not just the newly-expanded section.
    const scrollFormIntoView = () => requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));

    const form = useForm<InvoicingFormData>({
        resolver: zodResolver(schema),
        defaultValues: customer ? toFormData(customer) : undefined,
        mode: 'onTouched'
    });

    useEffect(() => {
        if (!customer || form.formState.isDirty) return;
        form.reset(toFormData(customer));
    }, [customer]);

    const onSubmit = async (data: InvoicingFormData) => {
        // Validation only lets a complete, non-duplicate address through as a draft, so fold it in
        // here rather than relying on blur having committed it to a chip first.
        const draft = (data.emailsDraft ?? '').trim();
        const emails = draft ? [...data.emails, ...parseEmailTokens(draft)] : data.emails;

        try {
            await putAsync({
                legalEntityName: data.legalEntityName,
                email: emails[0]!,
                additionalEmails: emails.slice(1),
                address: data.address,
                taxId: data.taxId
            });
            // Clears isDirty, which also re-enables the effect above that re-syncs from `customer`.
            form.reset({ ...data, emails, emailsDraft: '' });
            toast({ title: 'Invoicing details updated', variant: 'success' });
        } catch {
            toast({ title: 'Failed to update invoicing details', variant: 'error' });
        }
    };

    return (
        <Form {...form}>
            <form ref={formRef} onSubmit={form.handleSubmit(onSubmit)}>
                <Card>
                    {paymentMethodSection}
                    {customer ? (
                        <div className="border-t border-border-muted p-4 flex flex-row items-start gap-5 [&>*]:flex-1 [&>*]:min-w-0">
                            <FormField
                                control={form.control}
                                name="legalEntityName"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="flex gap-1 items-center">
                                            Legal entity name <span className="text-text-danger">*</span>
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="Acme Inc." {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <InvoicingEmailsField />
                        </div>
                    ) : isLoading ? (
                        <div className="border-t border-border-muted p-4 flex flex-col gap-3">
                            <Skeleton className="w-40 h-5" />
                            <Skeleton className="w-full h-9" />
                            <Skeleton className="w-full h-9" />
                        </div>
                    ) : null}

                    {customer && (
                        <>
                            <InvoicingAddressFields onExpand={scrollFormIntoView} />
                            <InvoicingTaxIdFields onExpand={scrollFormIntoView} />
                        </>
                    )}
                </Card>

                <div className="pt-4 flex items-center gap-3">
                    <Button type="submit" variant="primary" size="md" loading={isPending} disabled={!customer}>
                        Save changes
                    </Button>
                    <span aria-live="polite" className="text-text-secondary text-body-small-regular">
                        {form.formState.isDirty ? 'Unsaved changes' : ''}
                    </span>
                </div>
            </form>
        </Form>
    );
};
