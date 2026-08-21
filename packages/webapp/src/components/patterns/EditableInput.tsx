import { Check, Loader2, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { CopyButton } from '../ui/CopyButton';
import { ConditionalTooltip } from './ConditionalTooltip';

export interface EditableInputProps {
    id?: string;
    initialValue: string;
    onSave?: (value: string) => Promise<unknown>;
    secret?: boolean;
    textArea?: boolean;
    placeholder?: string;
    onEditingChange?: (isEditing: boolean) => void;
    validate?: (value: string) => string | null; // Returns error message or null
    onValidationChange?: (error: string | null) => void; // Called when validation state changes
    hintText?: string; // Hint text to display when editing (shown when no error, or as fallback)
    disabled?: boolean | string;
    canEdit?: boolean; // Permission to edit
    canRead?: boolean; // Permission to read
}

export const EditableInput: React.FC<EditableInputProps> = ({
    id,
    initialValue,
    onSave,
    secret,
    textArea,
    placeholder: placeHolder,
    onEditingChange,
    validate,
    onValidationChange,
    hintText,
    disabled,
    canEdit = true,
    canRead = true
}) => {
    const [editing, setEditing] = useState(false);
    const [referenceValue, setReferenceValue] = useState(initialValue);
    const [value, setValue] = useState(referenceValue);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const onEditClicked = () => {
        setEditing(true);
        setError(null);
        onEditingChange?.(true);
    };

    // Focus in an effect because the control only becomes editable once `editing` flips.
    useEffect(() => {
        onEditingChange?.(editing);
        if (!editing) return;
        const el = textareaRef.current ?? inputRef.current;
        if (!el) return;
        el.focus();
        // Start editing from the end of the value, not wherever the caret was left in read mode.
        const end = el.value.length;
        el.setSelectionRange(end, end);
    }, [editing, onEditingChange]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        // Validate on change when editing
        if (editing && validate) {
            const validationError = validate(newValue);
            setError(validationError);
            onValidationChange?.(validationError);
        }
    };

    const onCancelClicked = () => {
        setEditing(false);
        setValue(referenceValue);
        setError(null);
        onValidationChange?.(null);
    };

    const onSaveClicked = async () => {
        if (value === referenceValue) {
            onCancelClicked();
            return;
        }

        // Validate before saving
        if (validate) {
            const validationError = validate(value);
            if (validationError) {
                setError(validationError);
                return; // Don't save if validation fails
            }
        }

        setLoading(true);
        setEditing(false);
        setError(null);
        onValidationChange?.(null);

        try {
            await onSave?.(value);
            setReferenceValue(value);
        } catch {
            setEditing(true);
        } finally {
            setLoading(false);
        }
    };

    const displayValue = !canRead ? '•'.repeat(32) : value;

    return (
        // In read mode the control is editable-looking but not editable, so drop the text caret cursor.
        <div className={`flex flex-col gap-2 ${!editing ? '[&_input]:cursor-default [&_textarea]:cursor-default' : ''}`}>
            <InputGroup>
                {textArea && (!secret || editing) ? (
                    <InputGroupTextarea
                        ref={textareaRef}
                        id={id}
                        value={displayValue}
                        onChange={handleChange}
                        rows={6}
                        // Read-only (not disabled) so the field still looks editable at rest; editing is gated by the pencil.
                        readOnly={!editing}
                        onKeyDown={(e) => {
                            if (!editing) return;
                            if (e.key === 'Escape') onCancelClicked();
                        }}
                        aria-invalid={!!error}
                    />
                ) : (
                    <InputGroupInput
                        ref={inputRef}
                        id={id}
                        value={displayValue}
                        placeholder={editing ? placeHolder : undefined}
                        onChange={handleChange}
                        type={secret && !editing ? 'password' : 'text'}
                        // Read-only (not disabled) so the field still looks editable at rest; editing is gated by the pencil.
                        readOnly={!editing}
                        onKeyDown={(e) => {
                            if (!editing) return;
                            if (e.key === 'Enter') void onSaveClicked();
                            if (e.key === 'Escape') onCancelClicked();
                        }}
                        aria-invalid={!!error}
                    />
                )}
                {loading ? (
                    <InputGroupAddon align="inline-end">
                        <Loader2 className="animate-spin" />
                    </InputGroupAddon>
                ) : !editing ? (
                    <>
                        <ConditionalTooltip condition={!!disabled && typeof disabled === 'string'} content={disabled} side="bottom">
                            <PermissionGate condition={canEdit} tooltipSide="bottom">
                                {(allowed) => (
                                    <InputGroupButton label="Edit" disabled={!!disabled || !allowed} onClick={onEditClicked} size="icon-sm">
                                        <Pencil className="size-3.5" />
                                    </InputGroupButton>
                                )}
                            </PermissionGate>
                        </ConditionalTooltip>
                        <InputGroupAddon align="inline-end">
                            <PermissionGate condition={canRead || !secret} tooltipSide="bottom">
                                {(allowed) => <CopyButton disabled={!allowed} text={value} className="size-6 p-0" />}
                            </PermissionGate>
                        </InputGroupAddon>
                    </>
                ) : (
                    <>
                        <InputGroupButton label="Cancel" onClick={onCancelClicked} size="icon-sm">
                            <X className="size-3.5" />
                        </InputGroupButton>
                        <InputGroupAddon align="inline-end">
                            <InputGroupButton label="Save" onClick={onSaveClicked} size="icon-sm" disabled={!!error}>
                                <Check className="size-3.5" />
                            </InputGroupButton>
                        </InputGroupAddon>
                    </>
                )}
            </InputGroup>
            {editing && (error || hintText) && (
                <p className={`text-body-small-regular ${error ? 'text-status-danger-text' : 'text-text-muted'}`}>{error || hintText}</p>
            )}
        </div>
    );
};
