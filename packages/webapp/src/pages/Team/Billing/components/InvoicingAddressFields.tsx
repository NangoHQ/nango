import { Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { countryCodes } from '../invoicingConstants';
import { InvoicingInput } from './InvoicingDetailsForm';
import { Button } from '@/components-v2/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';

import type { InvoicingFormData } from './InvoicingDetailsForm';

export const InvoicingAddressFields: React.FC = () => {
    const { control, setValue } = useFormContext<InvoicingFormData>();
    const address = useWatch({ control, name: 'address' });

    const handleAdd = () => {
        setValue('address', { line1: null, line2: null, city: null, state: null, postalCode: null, country: '' });
    };

    const handleRemove = () => {
        setValue('address', null);
    };

    if (!address) {
        return (
            <Card className="bg-bg-surface rounded border-2 border-border-disabled py-0 gap-0">
                <CardHeader className="bg-bg-elevated h-10 flex items-center px-6">
                    <CardTitle className="text-text-primary !text-heading-sm">Billing address</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
                        Add address
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-bg-surface rounded border-2 border-border-disabled py-0 gap-0">
            <CardHeader className="bg-bg-elevated h-10 flex flex-row items-center justify-between px-6">
                <CardTitle className="text-text-primary !text-heading-sm">Billing address</CardTitle>
                <Button type="button" variant="ghost" size="icon" onClick={handleRemove}>
                    <Trash2 className="size-4 text-fg-error" />
                </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 items-start px-6 py-9">
                <FormField
                    control={control}
                    name="address.line1"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Address line 1</FormLabel>
                            <FormControl>
                                <InvoicingInput placeholder="123 Main St" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="address.line2"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Address line 2</FormLabel>
                            <FormControl>
                                <InvoicingInput placeholder="Suite 100" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="address.city"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                                <InvoicingInput placeholder="San Francisco" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="address.state"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                                <InvoicingInput placeholder="CA" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="address.postalCode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Postal code</FormLabel>
                            <FormControl>
                                <InvoicingInput placeholder="94105" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="address.country"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex gap-1 items-center">
                                Country <span className="text-alert-400">*</span>
                            </FormLabel>
                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <FormControl>
                                    <SelectTrigger className="w-full bg-bg-surface border-border-muted text-text-primary data-[placeholder]:text-text-tertiary hover:bg-bg-surface focus:border-border-default">
                                        <SelectValue placeholder="Select a country" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {countryCodes.map(({ value, label }) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
};
