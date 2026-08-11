import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxValue } from '../../../../components/ui/Combobox';

import type { InvoicingFormData } from './InvoicingDetailsForm';

const emailSchema = z.string().email();

export const InvoicingEmailsField: React.FC = () => {
    const { control, setValue, setError, clearErrors } = useFormContext<InvoicingFormData>();
    // Falls back to [] before form.reset(toFormData(customer)) populates it.
    const emails = useWatch({ control, name: 'emails' }) ?? [];
    // Backed by the form, not local state, so superRefine can block Save on uncommitted text.
    const inputValue = useWatch({ control, name: 'emailsDraft' }) ?? '';
    const setInputValue = (value: string) => setValue('emailsDraft', value);

    // Chip removal isn't a native text edit, so the browser can't undo it — track it ourselves.
    const [removedStack, setRemovedStack] = useState<string[]>([]);

    const commit = (next: string[]) => {
        const removed = emails.filter((e) => !next.includes(e));
        if (removed.length > 0) {
            setRemovedStack((prev) => [...prev, ...removed]);
        }
        setValue('emails', next, { shouldDirty: true, shouldValidate: true });
    };

    const undoLastRemoval = () => {
        if (removedStack.length === 0) return;
        const last = removedStack[removedStack.length - 1]!;
        setRemovedStack((prev) => prev.slice(0, -1));
        setValue('emails', [...emails, last], { shouldDirty: true, shouldValidate: true });
    };

    // Splits on commas so a multi-address paste adds each one instead of one long invalid chip.
    const addEmailsFromText = (text: string) => {
        const candidates = text
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean);
        if (candidates.length === 0) return;

        const existingLower = new Set(emails.map((e) => e.toLowerCase()));
        const invalid = candidates.filter((c) => !emailSchema.safeParse(c).success);
        const valid: string[] = [];
        for (const c of candidates) {
            if (!emailSchema.safeParse(c).success) continue;
            const lower = c.toLowerCase();
            if (existingLower.has(lower)) continue;
            existingLower.add(lower);
            valid.push(c);
        }

        if (valid.length > 0) {
            commit([...emails, ...valid]);
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
            return;
        }

        // Only intercept Cmd/Ctrl+Z when the input is empty, else native text-undo should run.
        const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
        if (isUndo && !(e.target as HTMLInputElement).value) {
            e.preventDefault();
            undoLastRemoval();
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
                            {/* Overrides ComboboxChips' defaults to match Input's tokens (bg, border, radius, height, focus ring). */}
                            <ComboboxChips
                                className="min-h-8 rounded-ds-xs border-ds-hairline bg-surface-input border-border-interactive
                                focus-within:border-[var(--focus-ring-default)]
                                focus-within:shadow-[0_0_0_0.5px_var(--focus-ring-default),inset_0_0_0_0.5px_var(--focus-ring-default)]"
                            >
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
