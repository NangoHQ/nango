import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Input } from '@nangohq/design-system';

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePutBillingInvoicingDetails } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { countryCodes, taxIdTypes } from '../invoicingConstants';
import { InvoicingAddressFields } from './InvoicingAddressFields';
import { InvoicingEmailsField } from './InvoicingEmailsField';
import { toFormData } from './invoicingFormData.js';
import { InvoicingTaxIdFields } from './InvoicingTaxIdFields';

import type { BillingCustomer } from '@nangohq/types';

export const OptionalTag = () => (
    <span className="bg-surface-page border border-border-strong rounded px-2 py-0.5 text-body-small-regular text-text-muted">Optional</span>
);

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
        // Tracks text left in the chip input's textbox that hasn't been committed to `emails`
        // yet (e.g. a typo the user hasn't fixed or cleared). Not sent to the API — its only
        // job is to fail validation so Save can't silently drop it.
        emailsDraft: z.string(),
        address: addressSchema.nullable(),
        taxId: taxIdSchema.nullable()
    })
    .superRefine((data, ctx) => {
        const draft = data.emailsDraft.trim();
        if (draft && !z.string().email().safeParse(draft).success) {
            ctx.addIssue({ code: 'custom', path: ['emails'], message: `Invalid email address: ${draft}` });
        }
    });

export type InvoicingFormData = z.infer<typeof schema>;

export const InvoicingDetailsForm: React.FC<{ customer: BillingCustomer | undefined }> = ({ customer }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: putAsync, isPending } = usePutBillingInvoicingDetails(env);

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
        try {
            await putAsync({
                legalEntityName: data.legalEntityName,
                email: data.emails[0]!,
                additionalEmails: data.emails.slice(1),
                address: data.address,
                taxId: data.taxId
            });
            toast({ title: 'Invoicing details updated', variant: 'success' });
        } catch {
            toast({ title: 'Failed to update invoicing details', variant: 'error' });
        }
    };

    if (!customer) {
        return (
            <div className="border-t border-border-muted p-4 flex flex-col gap-3">
                <Skeleton className="w-40 h-5" />
                <Skeleton className="w-full h-9" />
                <Skeleton className="w-full h-9" />
            </div>
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="border-t border-border-muted p-4 flex flex-row items-start gap-5 [&>*]:flex-1">
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

                <InvoicingAddressFields />
                <InvoicingTaxIdFields />

                <div className="border-t border-border-muted p-4">
                    <Button type="submit" variant="primary" size="md" loading={isPending}>
                        Save changes
                    </Button>
                </div>
            </form>
        </Form>
    );
};
