import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { Card, CardAction, CardContent, CardHeader, CardTitle, IconButton, Input } from '@nangohq/design-system';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { countryCodes, countryToTaxIdTypes, taxIdTypes } from '../invoicingConstants';
import { OptionalTag } from './InvoicingDetailsForm';

import type { InvoicingFormData } from './InvoicingDetailsForm';

export const InvoicingTaxIdFields: React.FC = () => {
    const { control, setValue, clearErrors } = useFormContext<InvoicingFormData>();
    const taxId = useWatch({ control, name: 'taxId' });
    const selectedCountry = useWatch({ control, name: 'taxId.country' });
    const selectedType = useWatch({ control, name: 'taxId.type' });

    // Narrow the type dropdown to only the tax ID types supported by the selected country.
    // Falls back to the full list if the country has no mapping (shouldn't happen in practice).
    const filteredTypes = useMemo(() => {
        if (!selectedCountry) return taxIdTypes;
        const supported = countryToTaxIdTypes[selectedCountry];
        if (!supported || supported.length === 0) return taxIdTypes;
        return taxIdTypes.filter((t) => supported.includes(t.value));
    }, [selectedCountry]);

    // When the country changes and the previously selected type is no longer valid,
    // clear the type and value so the form doesn't submit a stale/incompatible tax ID.
    useEffect(() => {
        if (selectedType && !filteredTypes.some((t) => t.value === selectedType)) {
            setValue('taxId.type', '');
            setValue('taxId.value', '');
            clearErrors(['taxId.type', 'taxId.value']);
        }
    }, [filteredTypes]);

    const selectedTypeDef = taxIdTypes.find((t) => t.value === selectedType);
    const valuePlaceholder = selectedTypeDef?.placeholder ?? 'Tax ID value';
    const docType = selectedType ? selectedType.split('_')[1]?.toUpperCase() : null;
    const docFormat = selectedTypeDef?.placeholder.replace(/\d/g, 'X') ?? null;

    const taxIdValue = useWatch({ control, name: 'taxId.value' });

    const handleAdd = () => {
        setValue('taxId', { country: '', type: '', value: '' }, { shouldDirty: true });
        clearErrors('taxId');
    };

    const handleRemove = () => {
        setValue('taxId', null, { shouldDirty: true });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    <span className="flex items-center gap-2">
                        Tax ID
                        <OptionalTag />
                    </span>
                </CardTitle>
                <CardAction>
                    {taxId ? (
                        <IconButton type="button" variant="ghost" size="2xs" onClick={handleRemove} label="Remove tax ID">
                            <Trash2 />
                        </IconButton>
                    ) : (
                        <IconButton type="button" variant="ghost" size="2xs" onClick={handleAdd} label="Add tax ID">
                            <Plus />
                        </IconButton>
                    )}
                </CardAction>
            </CardHeader>
            {taxId && (
                <CardContent>
                    <div className="grid grid-cols-2 items-start gap-3">
                        <FormField
                            control={control}
                            name="taxId.country"
                            render={({ field }) => (
                                <FormItem className="col-span-1">
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
                        <FormField
                            control={control}
                            name="taxId.type"
                            render={({ field }) => (
                                <FormItem className="col-span-1">
                                    <FormLabel className="flex gap-1 items-center">
                                        Type <span className="text-text-danger">*</span>
                                    </FormLabel>
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <FormControl>
                                            <SelectTrigger className="w-full !bg-surface-canvas border-border-muted text-text-strong data-[placeholder]:text-text-muted hover:!bg-surface-canvas focus:border-border-default">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {filteredTypes.map(({ value, label }) => (
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
                            render={({ field, fieldState }) => (
                                <FormItem>
                                    <FormLabel className="flex gap-1 items-center">
                                        Value <span className="text-text-danger">*</span>
                                    </FormLabel>
                                    <FormControl>
                                        <Input placeholder={`e.g. ${valuePlaceholder}`} {...field} />
                                    </FormControl>
                                    {fieldState.error ? (
                                        <FormMessage />
                                    ) : (
                                        docType &&
                                        docFormat && (
                                            <p className={`text-body-small-regular ${taxIdValue ? 'text-text-muted' : 'text-text-danger'}`}>
                                                Enter your {docType} in the format {docFormat}
                                            </p>
                                        )
                                    )}
                                </FormItem>
                            )}
                        />
                    </div>
                </CardContent>
            )}
        </Card>
    );
};
