import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxValue } from '../../../../components/ui/Combobox';

import type { InvoicingFormData } from './InvoicingDetailsForm';

const emailSchema = z.string().email();

export const InvoicingEmailsField: React.FC = () => {
    const { control, setValue, setError, clearErrors } = useFormContext<InvoicingFormData>();
    // Defaults to [] for the render between the parent's `customer` becoming truthy
    // and the `form.reset(toFormData(customer))` effect actually populating the field.
    const emails = useWatch({ control, name: 'emails' }) ?? [];
    const [inputValue, setInputValue] = useState('');

    const commit = (next: string[]) => {
        setValue('emails', next, { shouldDirty: true, shouldValidate: true });
    };

    // Splits on commas so a paste of "a@x.com, b@x.com" (or Figma's comma-separated
    // display format) adds every address at once instead of one long invalid chip.
    const addEmailsFromText = (text: string) => {
        const candidates = text
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean);
        if (candidates.length === 0) return;

        const invalid = candidates.filter((c) => !emailSchema.safeParse(c).success);
        const valid = candidates.filter((c) => emailSchema.safeParse(c).success && !emails.includes(c));

        if (valid.length > 0) {
            commit(Array.from(new Set([...emails, ...valid])));
        }

        if (invalid.length > 0) {
            setError('emails', { type: 'manual', message: `Invalid email address: ${invalid.join(', ')}` });
            setInputValue(invalid.join(', '));
        } else {
            clearErrors('emails');
            setInputValue('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const value = (e.target as HTMLInputElement).value.replace(/,$/, '').trim();
            if (!value) return;
            addEmailsFromText(value);
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (!text.includes(',')) return;
        e.preventDefault();
        addEmailsFromText(text);
    };

    const handleBlur = () => {
        if (inputValue.trim()) {
            addEmailsFromText(inputValue);
        }
    };

    return (
        <FormField
            control={control}
            name="emails"
            render={() => (
                <FormItem>
                    <FormLabel className="flex gap-1 items-center">
                        Billing email addresses <span className="text-text-danger">*</span>
                    </FormLabel>
                    <FormControl>
                        <Combobox items={[]} multiple value={emails} inputValue={inputValue} onValueChange={commit} open={false}>
                            <ComboboxChips className="min-h-9">
                                {emails.length > 0 && (
                                    <ComboboxValue>
                                        {emails.map((email) => (
                                            <ComboboxChip key={email}>{email}</ComboboxChip>
                                        ))}
                                    </ComboboxValue>
                                )}
                                <ComboboxChipsInput
                                    placeholder={emails.length === 0 ? 'billing@company.com' : ''}
                                    value={inputValue}
                                    onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handlePaste}
                                    onBlur={handleBlur}
                                />
                            </ComboboxChips>
                        </Combobox>
                    </FormControl>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
};
