import { Plus, Trash2 } from 'lucide-react';
import { useFormContext, useWatch } from 'react-hook-form';

import { IconButton, Input } from '@nangohq/design-system';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { countryCodes } from '../invoicingConstants';
import { OptionalTag } from './InvoicingDetailsForm';

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
        <div className="border-t border-border-muted">
            <div className="p-4 flex items-center justify-between">
                <span className="flex items-center gap-2 text-text-strong text-body-medium-regular">
                    Billing address
                    <OptionalTag />
                </span>
                {address ? (
                    <IconButton type="button" variant="ghost" size="2xs" onClick={handleRemove} label="Remove line">
                        <Trash2 />
                    </IconButton>
                ) : (
                    <IconButton type="button" variant="ghost" size="2xs" onClick={handleAdd} label="Add line">
                        <Plus />
                    </IconButton>
                )}
            </div>
            {address && (
                <div className="px-4 pb-4">
                    <div className="grid grid-cols-2 items-start gap-3">
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
                    </div>
                </div>
            )}
        </div>
    );
};
