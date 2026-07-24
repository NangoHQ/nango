import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxValue } from '../../../../components/ui/Combobox';

import type { InvoicingFormData } from './InvoicingDetailsForm';

const emailSchema = z.string().email();

export const InvoicingEmailsField: React.FC = () => {
    const { control, setValue, setError, clearErrors } = useFormContext<InvoicingFormData>();
    // Both default to [] / '' for the render between the parent's `customer` becoming
    // truthy and the `form.reset(toFormData(customer))` effect actually populating the field.
    const emails = useWatch({ control, name: 'emails' }) ?? [];
    // Backed by the form (not local state) so leftover, uncommitted text is part of
    // `InvoicingFormData` and the schema's `superRefine` can block Save on it instead of
    // it silently vanishing if a revalidation pass clears the field's manually-set error.
    const inputValue = useWatch({ control, name: 'emailsDraft' }) ?? '';
    const setInputValue = (value: string) => setValue('emailsDraft', value);

    // Removing a chip (backspace or the chip's own × button) is a state update, not a native
    // text edit, so the browser's built-in Cmd/Ctrl+Z has nothing to undo. Track removals here
    // so we can restore the last one ourselves — see handleKeyDown.
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

    // Splits on commas so a paste of "a@x.com, b@x.com" (or Figma's comma-separated
    // display format) adds every address at once instead of one long invalid chip.
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

        // Only take over Cmd/Ctrl+Z when the input is empty — otherwise let the browser's
        // native undo handle an in-progress text edit in the draft input as usual.
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
                            {/* ComboboxChips defaults to bg-surface-canvas/border-border-muted, which reads as a
                                different (much darker) fill than a plain Input — match Input's own tokens instead. */}
                            <ComboboxChips className="min-h-9 bg-surface-input border-border-interactive">
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
