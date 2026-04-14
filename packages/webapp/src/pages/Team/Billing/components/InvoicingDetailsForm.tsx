import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { InvoicingAddressFields } from './InvoicingAddressFields';
import { InvoicingTaxIdFields } from './InvoicingTaxIdFields';
import { countryCodes, taxIdTypes } from '../invoicingConstants';
import { Button } from '@/components-v2/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { Input } from '@/components-v2/ui/input';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { usePutBillingInvoicingDetails } from '@/hooks/usePlan';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';

import type { BillingCustomer } from '@nangohq/types';

export const OptionalTag = () => (
    <span className="bg-bg-elevated border border-border-strong rounded px-2 py-0.5 text-body-small-regular text-text-muted">Optional</span>
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

const schema = z.object({
    legalEntityName: z.string().min(1, 'Required'),
    email: z.string().email('Valid email required'),
    address: addressSchema.nullable(),
    taxId: taxIdSchema.nullable()
});

export type InvoicingFormData = z.infer<typeof schema>;

function toFormData(customer: BillingCustomer): InvoicingFormData {
    return {
        legalEntityName: customer.invoicingDetails.legalEntityName,
        email: customer.invoicingDetails.email,
        address: customer.invoicingDetails.address ? { ...customer.invoicingDetails.address, country: customer.invoicingDetails.address.country ?? '' } : null,
        taxId: customer.invoicingDetails.taxId
    };
}

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
            await putAsync({ legalEntityName: data.legalEntityName, email: data.email, address: data.address, taxId: data.taxId });
            toast({ title: 'Invoicing details updated', variant: 'success' });
        } catch {
            toast({ title: 'Failed to update invoicing details', variant: 'error' });
        }
    };

    if (!customer) {
        return (
            <div className="flex flex-col gap-3">
                <Skeleton className="w-40 h-5" />
                <Skeleton className="w-full h-9" />
                <Skeleton className="w-full h-9" />
            </div>
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
                <Card className="bg-bg-surface rounded border-2 border-border-disabled py-0 gap-0">
                    <CardHeader className="bg-bg-elevated h-10 flex items-center px-6">
                        <CardTitle className="text-text-primary !text-heading-sm">Billing information</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-row gap-5 items-start [&>*]:flex-1 px-6 py-9">
                        <FormField
                            control={form.control}
                            name="legalEntityName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex gap-1 items-center">
                                        Legal entity name <span className="text-alert-400">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder="Acme Inc." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="flex gap-1 items-center">
                                        Billing email <span className="text-alert-400">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input type="email" placeholder="billing@company.com" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                </Card>

                <InvoicingAddressFields />
                <InvoicingTaxIdFields />

                <div className="flex justify-start">
                    <Button type="submit" variant="primary" size="lg" loading={isPending}>
                        Save changes
                    </Button>
                </div>
            </form>
        </Form>
    );
};
