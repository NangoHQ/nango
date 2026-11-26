import { Prism } from '@mantine/prism';
import { Check, Edit, Eye, EyeOff, Loader, Play, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Badge, Button, CopyButton, IconButton, Textarea } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { darkModeSelector, useThemeStore } from '../../lib/theme.js';
import { cn } from '../../utils/utils.js';
import { getTokenPrismTheme } from './prismTheme';

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
    wrapLines?: boolean;
    copyValue?: string;
    syntaxHighlight?: boolean;
    bare?: boolean;
    collapsedLines?: number;
    /** Controls expanding from outside, with `onExpandedChange`. The block then shows no "Show less" button. */
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
} & HTMLAttributes<HTMLDivElement>;

const highlight = {
    color: ''
};

export const COLLAPSED_MAX_LENGTH = 2_000;
// Prism highlights the whole block, so a large response freezes the page while it renders.
const MAX_HIGHLIGHTED_LENGTH = 50_000;

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
    wrapLines = false,
    copyValue,
    syntaxHighlight = true,
    bare = false,
    collapsedLines,
    expanded: expandedProp,
    onExpandedChange,
    ...props
}) => {
    const darkMode = useThemeStore(darkModeSelector);
    const [expandedState, setExpandedState] = useState(false);
    const controlled = expandedProp !== undefined;
    const expanded = expandedProp ?? expandedState;
    const setExpanded = (next: boolean) => {
        if (!controlled) {
            setExpandedState(next);
        }
        onExpandedChange?.(next);
    };

    const lineCount = useMemo(() => (collapsedLines ? code.split('\n').length : 0), [code, collapsedLines]);
    const collapsible = collapsedLines !== undefined && (lineCount > collapsedLines || code.length > COLLAPSED_MAX_LENGTH);
    const collapsed = collapsible && !expanded;
    const shownCode = useMemo(() => {
        if (!collapsed) {
            return code;
        }
        // Highlighting runs over every line it is given, so a collapsed block only gets the lines it shows.
        const head = code.split('\n').slice(0, collapsedLines).join('\n');
        return head.length > COLLAPSED_MAX_LENGTH ? `${head.slice(0, COLLAPSED_MAX_LENGTH)}…` : head;
    }, [code, collapsed, collapsedLines]);
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
    const codeRef = useRef<HTMLDivElement>(null);

    // CSS can't indent a wrapped line by its own leading spaces, so each line gets its indent set here.
    useLayoutEffect(() => {
        if (editing || !codeRef.current) {
            return;
        }
        for (const line of codeRef.current.querySelectorAll<HTMLElement>('.codeblock-line')) {
            const hang = wrapLines ? `${(line.textContent?.match(/^ */)?.[0].length ?? 0) + 2}ch` : '';
            line.style.paddingLeft = hang;
            line.style.textIndent = hang && `-${hang}`;
        }
    }, [wrapLines, editing, shownCode]);

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

    const copyText = editing ? draft : (copyValue ?? code);

    return (
        <div
            {...props}
            className={cn(
                bare ? 'muted-code group/code relative overflow-hidden rounded border border-border-muted' : 'border border-border-muted rounded',
                props.className
            )}
        >
            {bare && copyable && (
                <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover/code:opacity-100">
                    <CopyButton value={copyText} size="xs" />
                </div>
            )}
            {!bare && (
                <header className="flex justify-between items-center py-1.5 px-3 bg-surface-code border-b border-border-muted rounded-t">
                    <span className="text-text-muted text-s">{title}</span>
                    <div className="flex gap-2 items-center">
                        {headerElement}
                        {displayLanguage && (
                            <Badge>
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
                            <IconButton variant="ghost" size="sm" label="Toggle visibility" onClick={toggleSecretVisibility}>
                                {isSecretVisible ? <EyeOff /> : <Eye />}
                            </IconButton>
                        )}
                        {showEditControls && !editing && (
                            <PermissionGate asChild condition={canEdit} tooltipSide="bottom">
                                {(allowed) => (
                                    <IconButton variant="ghost" size="sm" label="Edit" onClick={onEditClicked} disabled={!allowed}>
                                        <Edit />
                                    </IconButton>
                                )}
                            </PermissionGate>
                        )}
                        {editing && (
                            <>
                                <IconButton variant="ghost" size="sm" label="Cancel" onClick={onCancelClicked} disabled={saving}>
                                    <X />
                                </IconButton>
                                <IconButton
                                    variant="ghost"
                                    size="sm"
                                    label="Save"
                                    onClick={onSaveClicked}
                                    disabled={saving || !!error}
                                    loading={showLoadingOnSave && saving}
                                >
                                    <Check />
                                </IconButton>
                            </>
                        )}
                        {!editing && copyable && <CopyButton value={copyText} size="sm" />}
                    </div>
                </header>
            )}
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
                    <div ref={codeRef} className="relative">
                        {!isSecretVisible && <div className="absolute z-10 w-full h-full backdrop-blur-xs bg-black/0"></div>}
                        <Prism
                            className="w-full min-w-0"
                            classNames={{ lineContent: 'codeblock-line' }}
                            // A language without a grammar skips tokenizing and renders the same box as plain text.
                            language={syntaxHighlight && shownCode.length <= MAX_HIGHLIGHTED_LENGTH ? language : ('plain' as PrismProps['language'])}
                            colorScheme={darkMode ? 'dark' : 'light'}
                            getPrismTheme={getTokenPrismTheme}
                            noCopy={true}
                            styles={{ code: { fontSize: '12px', ...(wrapLines ? { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } : {}) } }}
                            highlightLines={Object.fromEntries(highlightedLines?.map((line) => [line, highlight]) ?? [])}
                        >
                            {shownCode}
                        </Prism>
                        {collapsed && (
                            <>
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-linear-to-b from-transparent to-surface-code" />
                                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2">
                                    <Button variant="outline-filled" size="xs" aria-expanded={false} onClick={() => setExpanded(true)}>
                                        {lineCount > 1 ? `Show all ${lineCount} lines` : 'Show all'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
            {collapsible && expanded && !controlled && (
                <div className="flex justify-center border-t border-border-muted py-1.5">
                    <Button variant="ghost" size="xs" aria-expanded={true} onClick={() => setExpanded(false)}>
                        Show less
                    </Button>
                </div>
            )}
            {editing && hintText && !error && <p className="px-3 py-2 text-body-small-regular text-text-tertiary">*{hintText}</p>}
        </div>
    );
};
