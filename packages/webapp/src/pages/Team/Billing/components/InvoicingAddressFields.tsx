import { Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { countryCodes } from '../invoicingConstants';
import { FormLabelWithTooltip } from './FormLabelWithTooltip';
import { Button } from '@/components-v2/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components-v2/ui/card';
import { FormControl, FormField, FormItem, FormMessage } from '@/components-v2/ui/form';
import { Input } from '@/components-v2/ui/input';
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
            <Card className="bg-bg-elevated rounded border-none">
                <CardHeader>
                    <div className="flex flex-col gap-1.5">
                        <CardTitle className="text-text-primary">Billing address</CardTitle>
                    </div>
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
        <Card className="bg-bg-elevated rounded border-none">
            <CardHeader className="flex flex-row items-center justify-between p-6">
                <div className="flex flex-col gap-1.5">
                    <CardTitle className="text-text-primary">Billing address</CardTitle>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={handleRemove}>
                    <Trash2 className="size-4 text-fg-error" />
                </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 items-start">
                <FormField
                    control={control}
                    name="address.line1"
                    render={({ field }) => (
                        <FormItem className="col-span-2">
                            <FormLabelWithTooltip tooltip="Street address or P.O. box">Address line 1</FormLabelWithTooltip>
                            <FormControl>
                                <Input placeholder="123 Main St" {...field} value={field.value ?? ''} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={control}
                    name="address.line2"
                    render={({ field }) => (
                        <FormItem className="col-span-2">
                            <FormLabelWithTooltip tooltip="Apartment, suite, unit, building, or floor">Address line 2</FormLabelWithTooltip>
                            <FormControl>
                                <Input placeholder="Suite 100" {...field} value={field.value ?? ''} />
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
                            <FormLabelWithTooltip tooltip="City or locality">City</FormLabelWithTooltip>
                            <FormControl>
                                <Input placeholder="San Francisco" {...field} value={field.value ?? ''} />
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
                            <FormLabelWithTooltip tooltip="State, province, or region">State</FormLabelWithTooltip>
                            <FormControl>
                                <Input placeholder="CA" {...field} value={field.value ?? ''} />
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
                            <FormLabelWithTooltip tooltip="ZIP or postal code">Postal code</FormLabelWithTooltip>
                            <FormControl>
                                <Input placeholder="94105" {...field} value={field.value ?? ''} />
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
                            <FormLabelWithTooltip required tooltip="Country">
                                Country
                            </FormLabelWithTooltip>
                            <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <FormControl>
                                    <SelectTrigger className="w-full bg-bg-surface border-border-strong data-[placeholder]:border-border-muted text-text-primary data-[placeholder]:text-text-tertiary hover:bg-bg-surface focus:border-border-default">
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
