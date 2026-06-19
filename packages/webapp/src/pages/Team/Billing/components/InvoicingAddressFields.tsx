import { Plus, Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { IconButton } from '@nangohq/design-system';

import { countryCodes } from '../invoicingConstants';
import { OptionalTag } from './InvoicingDetailsForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';

import type { InvoicingFormData } from './InvoicingDetailsForm';

export const InvoicingAddressFields: React.FC = () => {
    const { control, setValue, clearErrors } = useFormContext<InvoicingFormData>();
    const address = useWatch({ control, name: 'address' });

    const handleAdd = () => {
        setValue('address', { line1: null, line2: null, city: null, state: null, postalCode: null, country: '' }, { shouldDirty: true });
        clearErrors('address');
    };

    const handleRemove = () => {
        setValue('address', null, { shouldDirty: true });
    };

    return (
        <Card className="bg-surface-page rounded border border-border-muted py-0 gap-0">
            <CardHeader className="bg-surface-panel h-10 flex flex-row items-center justify-between px-6">
                <CardTitle className="text-text-strong !text-heading-sm flex items-center gap-2">
                    Billing address
                    <OptionalTag />
                </CardTitle>
                {address ? (
                    <IconButton type="button" variant="ghost" size="2xs" onClick={handleRemove} label="Remove line">
                        <Trash2 />
                    </IconButton>
                ) : (
                    <IconButton type="button" variant="ghost" size="2xs" onClick={handleAdd} label="Add line">
                        <Plus />
                    </IconButton>
                )}
            </CardHeader>
            {address && (
                <CardContent className="grid grid-cols-2 gap-3 items-start px-6 py-9">
                    <FormField
                        control={control}
                        name="address.line1"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Address line 1</FormLabel>
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
                            <FormItem>
                                <FormLabel>Address line 2</FormLabel>
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
                                <FormLabel>City</FormLabel>
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
                                <FormLabel>State</FormLabel>
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
                                <FormLabel>Postal code</FormLabel>
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
                                <FormLabel className="flex gap-1 items-center">
                                    Country <span className="text-text-danger">*</span>
                                </FormLabel>
                                <Select value={field.value || undefined} onValueChange={field.onChange}>
                                    <FormControl>
                                        <SelectTrigger className="w-full !bg-surface-canvas border-border-muted text-text-strong data-[placeholder]:text-text-muted hover:!bg-surface-canvas focus:border-border-default">
                                            <SelectValue placeholder="Choose country" />
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
            )}
        </Card>
    );
};
