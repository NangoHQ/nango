import { Prism } from '@mantine/prism';
import { Check, Edit, Eye, EyeOff, Loader, Play, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button, IconButton, Textarea } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { darkModeSelector, useThemeStore } from '../../lib/theme.js';
import { cn } from '../../utils/utils.js';
import { Badge } from './Badge.js';
import { CopyButton } from './CopyButton.js';

import type { PrismProps } from '@mantine/prism';
import type { MaybePromise } from '@nangohq/types';
import type { HTMLAttributes } from 'react';

export type CodeBlockProps = {
    title?: string;
    language: PrismProps['language'];
    code: string;
    copyable?: boolean;
    icon?: React.ReactNode;
    headerElement?: React.ReactNode;
    displayLanguage?: string;
    highlightedLines?: number[];
    secret?: boolean;
    onExecute?: () => MaybePromise<void>;
    /** When false, code area has no max-height/scroll; parent should scroll (e.g. in Playground). Default true. */
    constrainHeight?: boolean;
    canEdit?: boolean;
    onSave?: (code: string) => Promise<unknown>;
    validate?: (code: string) => string | null;
    hintText?: string;
    /** When false, the save button does not show a loading state (e.g. when saving launches a confirmation dialog instead of issuing a network request) Default true. */
    showLoadingOnSave?: boolean;
} & HTMLAttributes<HTMLDivElement>;

const highlight = {
    color: ''
};

export const CodeBlock: React.FC<CodeBlockProps> = ({
    title,
    code,
    language,
    copyable = true,
    icon,
    headerElement,
    displayLanguage,
    highlightedLines,
    secret,
    onExecute,
    constrainHeight = true,
    canEdit = false,
    onSave,
    validate,
    hintText,
    showLoadingOnSave = true,
    ...props
}) => {
    const darkMode = useThemeStore(darkModeSelector);
    const [isSecretVisible, setIsSecretVisible] = useState(!secret);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(code);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isEditable = Boolean(onSave);
    const showEditControls = isEditable;

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    const [isExecuting, setIsExecuting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustTextareaHeight = useCallback(() => {
        const el = textareaRef.current;
        if (!el) {
            return;
        }
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => {
        if (!editing) {
            setDraft(code);
        }
    }, [code, editing]);

    useLayoutEffect(() => {
        if (editing) {
            adjustTextareaHeight();
        }
    }, [editing, draft, adjustTextareaHeight]);

    const onClickExecute = async () => {
        if (!onExecute) {
            return;
        }

        setIsExecuting(true);
        try {
            await onExecute();
        } finally {
            setIsExecuting(false);
        }
    };

    const onEditClicked = () => {
        setDraft(code);
        setError(null);
        setEditing(true);
    };

    const onCancelClicked = () => {
        setDraft(code);
        setError(null);
        setEditing(false);
    };

    const onSaveClicked = async () => {
        if (draft === code) {
            onCancelClicked();
            return;
        }

        if (validate) {
            const validationError = validate(draft);
            if (validationError) {
                setError(validationError);
                return;
            }
        }

        setSaving(true);
        setError(null);

        try {
            await onSave?.(draft);
            setEditing(false);
        } catch {
            setEditing(true);
        } finally {
            setSaving(false);
        }
    };

    const handleDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setDraft(newValue);
        if (validate) {
            setError(validate(newValue));
        }
    };

    const copyText = editing ? draft : code;

    return (
        <div {...props} className={cn('border border-border-muted rounded', props.className)}>
            <header className="flex justify-between items-center py-1.5 px-3 bg-surface-panel-inset rounded-t">
                <span className="text-text-muted text-s">{title}</span>
                <div className="flex gap-2 items-center">
                    {headerElement}
                    {displayLanguage && (
                        <Badge variant="gray" className="uppercase">
                            {icon && icon}
                            {displayLanguage}
                        </Badge>
                    )}
                    {!editing && onExecute && (
                        <Button variant="outline" onClick={onClickExecute} disabled={isExecuting}>
                            {isExecuting ? (
                                <>
                                    <Loader className="size-4 animate-spin text-text-secondary" />
                                    Running...
                                </>
                            ) : (
                                <>
                                    <Play className="size-4 text-text-brand" />
                                    Run
                                </>
                            )}
                        </Button>
                    )}
                    {!editing && secret && (
                        <IconButton variant="ghost" size="2xs" label="Toggle visibility" onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeOff /> : <Eye />}
                        </IconButton>
                    )}
                    {showEditControls && !editing && (
                        <PermissionGate asChild condition={canEdit} tooltipSide="bottom">
                            {(allowed) => (
                                <IconButton variant="ghost" size="2xs" label="Edit" onClick={onEditClicked} disabled={!allowed}>
                                    <Edit className="size-3.5" />
                                </IconButton>
                            )}
                        </PermissionGate>
                    )}
                    {editing && (
                        <>
                            <IconButton variant="ghost" size="2xs" label="Cancel" onClick={onCancelClicked} disabled={saving}>
                                <X className="size-3.5" />
                            </IconButton>
                            <IconButton
                                variant="ghost"
                                size="2xs"
                                label="Save"
                                onClick={onSaveClicked}
                                disabled={saving || !!error}
                                loading={showLoadingOnSave && saving}
                            >
                                <Check className="size-3.5" />
                            </IconButton>
                        </>
                    )}
                    {!editing && copyable && <CopyButton text={copyText} />}
                </div>
            </header>
            <div className={cn(constrainHeight && 'max-h-128 overflow-auto')}>
                {editing ? (
                    <div className="relative">
                        {error && (
                            <p
                                id="codeblock-validation-error"
                                className="pointer-events-none absolute top-2 right-2 z-10 max-w-[min(70%,16rem)] rounded px-2 py-1 text-body-small-regular bg-status-warning-bg text-status-warning-text shadow-sm"
                                role="alert"
                            >
                                {error}
                            </p>
                        )}
                        <Textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={handleDraftChange}
                            className={cn(
                                'block w-full min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent px-3 py-2 font-mono text-xs leading-normal shadow-none focus-visible:shadow-none',
                                error && 'pr-28'
                            )}
                            style={{ fontSize: '12px' }}
                            aria-invalid={!!error}
                            aria-describedby={error ? 'codeblock-validation-error' : undefined}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    onCancelClicked();
                                }
                            }}
                        />
                    </div>
                ) : (
                    <div className="relative">
                        {!isSecretVisible && <div className="absolute z-10 w-full h-full backdrop-blur-xs bg-black/0"></div>}
                        <Prism
                            className="w-full min-w-0"
                            language={language}
                            colorScheme={darkMode ? 'dark' : 'light'}
                            noCopy={true}
                            styles={{ code: { fontSize: '12px' } }}
                            highlightLines={Object.fromEntries(highlightedLines?.map((line) => [line, highlight]) ?? [])}
                        >
                            {code}
                        </Prism>
                    </div>
                )}
            </div>
            {editing && hintText && !error && <p className="px-3 py-2 text-body-small-regular text-text-tertiary">*{hintText}</p>}
        </div>
    );
};
