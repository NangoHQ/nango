import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxValue } from '../../../../components/ui/Combobox';
import { isCompleteEmail, isFullyTokenizable, parseEmailTokens } from './invoicingEmails';

import type { InvoicingFormData } from './InvoicingDetailsForm';

export const InvoicingEmailsField: React.FC = () => {
    const { control, setValue, setError, clearErrors } = useFormContext<InvoicingFormData>();
    // Falls back to [] before form.reset(toFormData(customer)) populates it.
    const emails = useWatch({ control, name: 'emails' }) ?? [];
    // Backed by the form, not local state, so superRefine can block Save on uncommitted text.
    const inputValue = useWatch({ control, name: 'emailsDraft' }) ?? '';
    const setInputValue = (value: string) => setValue('emailsDraft', value, { shouldDirty: true });

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
        // Skip re-adding if it's already back in the list, otherwise this creates a duplicate.
        if (emails.some((e) => e.toLowerCase() === last.toLowerCase())) return;
        setValue('emails', [...emails, last], { shouldDirty: true, shouldValidate: true });
    };

    // Splits on commas and whitespace so a multi-address paste or a space-separated typed list
    // adds each one instead of one long invalid chip.
    const addEmailsFromText = (text: string) => {
        const candidates = parseEmailTokens(text);
        if (candidates.length === 0) return;

        const existingLower = new Set(emails.map((e) => e.toLowerCase()));
        const valid: string[] = [];
        const invalid: string[] = [];
        const duplicate: string[] = [];
        for (const c of candidates) {
            if (!isCompleteEmail(c)) {
                invalid.push(c);
                continue;
            }
            const lower = c.toLowerCase();
            if (existingLower.has(lower)) {
                duplicate.push(c);
                continue;
            }
            existingLower.add(lower);
            valid.push(c);
        }

        // Update the draft before commit() triggers validation, otherwise it revalidates while
        // emailsDraft still holds the just-typed text, which now also matches the freshly
        // committed email and gets flagged as a duplicate of itself.
        const errors: string[] = [];
        if (invalid.length > 0) errors.push(`Invalid email address: ${invalid.join(', ')}`);
        if (duplicate.length > 0) errors.push(`Already added: ${duplicate.join(', ')}`);

        if (errors.length > 0) {
            setError('emails', { type: 'manual', message: errors.join('. ') });
            setInputValue([...invalid, ...duplicate].join(', '));
        } else {
            clearErrors('emails');
            setInputValue('');
        }

        if (valid.length > 0) {
            commit([...emails, ...valid]);
        }
    };

    const handleKeyDown: NonNullable<React.ComponentProps<typeof ComboboxChipsInput>['onKeyDown']> = (e) => {
        // Base UI clears the whole selection on Escape whenever its popup isn't mounted, which for
        // this field is always. preventDefault() doesn't stop it — mergeProps only skips Base UI's
        // handler when the consumer's handler calls this.
        if (e.key === 'Escape') {
            e.preventBaseUIHandler();
            return;
        }

        // Don't intercept while an IME composition is in progress, e.g. the space that finalizes
        // a composed CJK character shouldn't be swallowed as a commit trigger.
        if (e.nativeEvent.isComposing) return;

        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
            e.preventDefault();
            const value = (e.target as HTMLInputElement).value.replace(/,$/, '').trim();
            if (!value) return;
            addEmailsFromText(value);
        }
    };

    // Bound to the chips container (not just the input) so Cmd/Ctrl+Z still works right after
    // deleting a chip with the keyboard, when focus has moved to the next chip rather than back
    // into the input.
    const handleUndoShortcut = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
        if (!isUndo || removedStack.length === 0) return;
        // Let native text-undo run if the user is actively editing draft text.
        if (e.target instanceof HTMLInputElement && e.target.value) return;
        e.preventDefault();
        undoLastRemoval();
    };

    // The container is mostly padding and wrapped-row gaps; without this, clicking anywhere that
    // isn't a chip or the input itself does nothing, which makes the field look read-only.
    const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target instanceof Element && e.target.closest('[data-slot="combobox-chip"], input')) return;
        const input = e.currentTarget.querySelector<HTMLInputElement>('input[data-slot="combobox-chip-input"]');
        if (!input) return;
        e.preventDefault();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        if (!text.trim()) return;

        // Splice at the caret instead of replacing, so pasting into half-typed text keeps it.
        const input = e.currentTarget;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const merged = input.value.slice(0, start) + text + input.value.slice(end);
        e.preventDefault();

        // Tokenize only once the draft is made up entirely of complete addresses. Pasting a
        // fragment to build one up leaves editable text rather than an invalid-email error.
        if (isFullyTokenizable(merged)) {
            addEmailsFromText(merged);
            return;
        }

        clearErrors('emails');
        setInputValue(merged);
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
                            {/* Overrides ComboboxChips' defaults to match Input's tokens (bg, border, radius, height, focus ring).
                            Scoped to the input specifically (not focus-within) so a keyboard-focused chip shows only its own
                            ring, not this one too. */}
                            <ComboboxChips
                                onKeyDown={handleUndoShortcut}
                                onMouseDown={handleContainerMouseDown}
                                className="min-h-8 rounded-ds-xs border-ds-hairline bg-surface-input border-border-interactive
                                has-[input:focus]:border-[var(--focus-ring-default)]
                                has-[input:focus]:shadow-[0_0_0_0.5px_var(--focus-ring-default),inset_0_0_0_0.5px_var(--focus-ring-default)]"
                            >
                                {emails.length > 0 && (
                                    <ComboboxValue>
                                        {emails.map((email) => (
                                            <ComboboxChip key={email}>{email}</ComboboxChip>
                                        ))}
                                    </ComboboxValue>
                                )}
                                <ComboboxChipsInput
                                    placeholder={emails.length === 0 ? 'billing@company.com' : 'Add another email'}
                                    value={inputValue}
                                    onChange={(e) => {
                                        setInputValue((e.target as HTMLInputElement).value);
                                        // The user is actively editing, so the error is now stale — addEmailsFromText
                                        // re-sets it if the edited text is still invalid/duplicate on the next commit attempt.
                                        clearErrors('emails');
                                    }}
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
