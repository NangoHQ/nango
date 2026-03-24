import { Check, Edit, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ConditionalTooltip } from './ConditionalTooltip';
import { CopyButton } from './CopyButton';
import { PermissionCondition } from './PermissionGate';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupTextarea } from './ui/input-group';

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

    // We have to focus on useEffect because the input is disabled when not editing
    useEffect(() => {
        onEditingChange?.(editing);
        if (editing) {
            inputRef.current?.focus();
        }
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

    return (
        <div className="flex flex-col gap-2">
            <InputGroup>
                {textArea && (!secret || editing) ? (
                    <InputGroupTextarea
                        ref={textareaRef}
                        id={id}
                        value={value}
                        onChange={handleChange}
                        className="h-36"
                        disabled={!editing}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') onCancelClicked();
                        }}
                        aria-invalid={!!error}
                    />
                ) : (
                    <InputGroupInput
                        ref={inputRef}
                        id={id}
                        value={value}
                        placeholder={editing ? placeHolder : undefined}
                        onChange={handleChange}
                        type={secret && !editing ? 'password' : 'text'}
                        disabled={!editing}
                        onKeyDown={(e) => {
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
                            <PermissionCondition condition={canEdit} tooltipSide="bottom">
                                {(allowed) => (
                                    <InputGroupButton disabled={!!disabled || !allowed} onClick={onEditClicked} size="icon-sm">
                                        <Edit />
                                    </InputGroupButton>
                                )}
                            </PermissionCondition>
                        </ConditionalTooltip>
                        <InputGroupAddon align="inline-end">
                            <PermissionCondition condition={canRead || !secret} tooltipSide="bottom">
                                {(allowed) => <CopyButton disabled={!allowed} text={value} />}
                            </PermissionCondition>
                        </InputGroupAddon>
                    </>
                ) : (
                    <>
                        <InputGroupButton onClick={onCancelClicked} size="icon-sm">
                            <X />
                        </InputGroupButton>
                        <InputGroupButton onClick={onSaveClicked} size="icon-sm" disabled={!!error}>
                            <Check />
                        </InputGroupButton>
                    </>
                )}
            </InputGroup>
            {editing && (error || hintText) && (
                <p className={`text-body-small-regular ${error ? 'text-feedback-error-fg' : 'text-text-tertiary'}`}>*{error || hintText}</p>
            )}
        </div>
    );
};
