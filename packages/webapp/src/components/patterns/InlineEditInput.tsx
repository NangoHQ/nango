import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { cn } from '@/utils/utils';
import { CopyButton } from '../ui/CopyButton';

export interface InlineEditInputProps {
    id?: string;
    /** The saved value. The field resyncs to it whenever it changes outside of editing. */
    value: string;
    /** Persist the draft. Reject to stay in edit mode (e.g. the API refused the value). */
    onSave: (value: string) => Promise<unknown>;
    placeholder?: string;
    /** Permission to edit — when false the Edit button is disabled with a permission tooltip. */
    canEdit?: boolean;
    /** Render the value in the mono font (URLs, keys, ids). */
    mono?: boolean;
    /** Shown under the field while editing — e.g. a warning about what changing the value implies. */
    editingFooter?: React.ReactNode;
    onEditingChange?: (editing: boolean) => void;
}

/**
 * Read-only value with Copy + Edit addons. Edit switches the addon to Confirm (✕ cancel / ✓ save).
 * Enter or ✓ saves, Esc or ✕ cancels; focus returns to the Edit button after either.
 */
export const InlineEditInput: React.FC<InlineEditInputProps> = ({ id, value, onSave, placeholder, canEdit = true, mono, editingFooter, onEditingChange }) => {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    // Last saved value — lets the field show a fresh save before the parent refetches `value`.
    const [committed, setCommitted] = useState(value);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const restoreFocus = useRef(false);
    const onEditingChangeRef = useRef(onEditingChange);
    onEditingChangeRef.current = onEditingChange;

    useEffect(() => {
        setCommitted(value);
        if (!editing) setDraft(value);
        // Only resync when the saved value changes, not when editing toggles.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {
        onEditingChangeRef.current?.(editing);
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        } else if (restoreFocus.current) {
            restoreFocus.current = false;
            editButtonRef.current?.focus();
        }
    }, [editing]);

    const exitEditing = () => {
        restoreFocus.current = true;
        setEditing(false);
    };

    const cancel = () => {
        setDraft(committed);
        exitEditing();
    };

    const save = async () => {
        if (saving) return;
        if (draft === committed) {
            exitEditing();
            return;
        }
        setSaving(true);
        try {
            await onSave(draft);
            setCommitted(draft);
            exitEditing();
        } catch {
            // Stay in edit mode so the user can fix the value; the caller surfaces the error.
            inputRef.current?.focus();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {/* In read mode the field isn't editable, so drop the text caret cursor. */}
            <div className={cn(!editing && '[&_input]:cursor-default')}>
                <InputGroup>
                    <InputGroupInput
                        ref={inputRef}
                        id={id}
                        value={draft}
                        placeholder={editing ? placeholder : undefined}
                        readOnly={!editing || saving}
                        aria-busy={saving || undefined}
                        className={cn(mono && 'font-mono')}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (!editing || saving) return;
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void save();
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancel();
                            }
                        }}
                    />
                    <InputGroupAddon align="inline-end">
                        {editing ? (
                            <>
                                <InputGroupButton label="Cancel" onClick={cancel} disabled={saving}>
                                    <X />
                                </InputGroupButton>
                                <InputGroupButton label="Save" onClick={() => void save()} disabled={saving} loading={saving}>
                                    <Check className={cn(!saving && 'text-icon-brand')} />
                                </InputGroupButton>
                            </>
                        ) : (
                            <>
                                <CopyButton text={committed} />
                                <PermissionGate condition={canEdit}>
                                    {(allowed) => (
                                        <InputGroupButton ref={editButtonRef} label="Edit" onClick={() => setEditing(true)} disabled={!allowed}>
                                            <Pencil />
                                        </InputGroupButton>
                                    )}
                                </PermissionGate>
                            </>
                        )}
                    </InputGroupAddon>
                </InputGroup>
            </div>
            {editing && editingFooter}
        </div>
    );
};
