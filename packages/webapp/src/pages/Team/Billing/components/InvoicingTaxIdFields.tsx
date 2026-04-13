import { Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { countryCodes, taxIdTypes } from '../invoicingConstants';
import { InvoicingInput } from './InvoicingDetailsForm';
import { Button } from '@/components-v2/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components-v2/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components-v2/ui/select';

import type { InvoicingFormData } from './InvoicingDetailsForm';

export const InvoicingTaxIdFields: React.FC = () => {
    const { control, setValue } = useFormContext<InvoicingFormData>();
    const taxId = useWatch({ control, name: 'taxId' });

    const handleAdd = () => {
        setValue('taxId', { country: '', type: '', value: '' });
    };

    const handleRemove = () => {
        setValue('taxId', null);
    };

    if (!taxId) {
        return (
            <Card className="bg-bg-surface rounded border-2 border-border-disabled py-0 gap-0">
                <CardHeader className="bg-bg-elevated h-10 flex items-center px-6">
                    <CardTitle className="text-text-primary !text-heading-sm">Tax ID</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
                        Add tax ID
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-bg-surface rounded border-2 border-border-disabled py-0 gap-0">
            <CardHeader className="bg-bg-elevated h-10 flex flex-row items-center justify-between px-6">
                <CardTitle className="text-text-primary !text-heading-sm">Tax ID</CardTitle>
                <Button type="button" variant="ghost" size="icon" onClick={handleRemove}>
                    <Trash2 className="size-4 text-fg-error" />
                </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 items-start px-6 py-9">
                <FormField
                    control={control}
                    name="taxId.country"
                    render={({ field }) => (
                        <FormItem className="col-span-1">
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
                <FormField
                    control={control}
                    name="taxId.type"
                    render={({ field }) => (
                        <FormItem className="col-span-1">
                            <FormLabel className="flex gap-1 items-center">
                                Type <span className="text-alert-400">*</span>
                            </FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                    <SelectTrigger className="w-full bg-bg-surface border-border-muted text-text-primary data-[placeholder]:text-text-tertiary hover:bg-bg-surface focus:border-border-default">
                                        <SelectValue placeholder="Select a type" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {taxIdTypes.map(({ value, label }) => (
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
                <FormField
                    control={control}
                    name="taxId.value"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex gap-1 items-center">
                                Value <span className="text-alert-400">*</span>
                            </FormLabel>
                            <FormControl>
                                <InvoicingInput placeholder="12-3456789" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </CardContent>
        </Card>
    );
};
