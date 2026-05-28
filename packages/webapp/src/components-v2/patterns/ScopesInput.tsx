import { CornerDownLeft, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CopyButton } from './CopyButton.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxCollection,
    ComboboxContent,
    ComboboxItem,
    ComboboxList,
    ComboboxValue
} from './ui/combobox.js';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.js';
import { cn } from '@/utils/utils';

interface ScopesInputProps {
    scopesString?: string | undefined;
    onChange?: (scopes: string, countDifference: number) => Promise<void>;
    placeholder?: string;
    isSharedCredentials?: boolean;
    readOnly?: boolean;
    availableScopes?: string[] | undefined;
    showAvailableScopesDropdown?: boolean;
}

export const ScopesInput: React.FC<ScopesInputProps> = ({
    scopesString,
    onChange,
    placeholder,
    isSharedCredentials,
    readOnly,
    availableScopes,
    showAvailableScopesDropdown
}) => {
    const [scopes, setScopes] = useState<string[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [inputValue, setInputValue] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const chipsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scopesString) {
            setScopes(
                scopesString
                    .split(',')
                    .map((scope) => scope.trim())
                    .filter(Boolean)
            );
        } else {
            setScopes([]);
        }
    }, [scopesString]);

    const onValueChange = async (newScopes: string[]) => {
        if (isSharedCredentials || readOnly) return;
        const countDifference = newScopes.length - scopes.length;

        if (countDifference === 0) {
            setInputValue('');
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            await onChange?.(newScopes.join(','), countDifference);
            setScopes(newScopes);
            setInputValue('');
            setDropdownOpen(false);
        } finally {
            setLoading(false);
        }
    };

    const deleteAllScopes = async () => {
        await onValueChange([]);
    };

    const addScopesFromText = async (text: string) => {
        const newScopes = text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (newScopes.length === 0) return;
        const merged = Array.from(new Set([...scopes, ...newScopes]));
        if (merged.length !== scopes.length) {
            await onValueChange(merged);
        }
        setInputValue('');
        setDropdownOpen(false);
    };

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            const value = (e.target as HTMLInputElement).value.replace(/,$/, '').trim();
            if (!value) return;
            e.preventDefault();
            await addScopesFromText(value);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
        const text = e.clipboardData.getData('text');
        e.preventDefault();
        await addScopesFromText(text);
    };

    const hasAvailableScopesDropdown = showAvailableScopesDropdown && !!availableScopes?.length && !isSharedCredentials && !readOnly;
    const finalPlaceholder = placeholder ?? (isSharedCredentials ? '' : 'Add new scope');
    const filteredSuggestions = (availableScopes ?? []).filter(
        (s) => !scopes.includes(s) && (!inputValue.trim() || s.toLowerCase().includes(inputValue.trim().toLowerCase()))
    );

    if (isSharedCredentials || readOnly) {
        return (
            <div className="flex flex-wrap items-center gap-1.5 min-h-9 rounded border border-border-muted bg-bg-surface px-2 py-1.5">
                {scopes.map((scope) => (
                    <span
                        key={scope}
                        className="inline-flex h-[21px] items-center gap-1 rounded bg-bg-subtle border border-border-default px-2 text-xs font-medium text-text-primary"
                    >
                        {scope}
                    </span>
                ))}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                    {scopes.length > 0 && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <CopyButton text={scopes.join(',')} />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">Copy all</TooltipContent>
                        </Tooltip>
                    )}
                    {isSharedCredentials ? <Badge variant="gray">Nango provided</Badge> : null}
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-w-0">
            {scopes.length > 0 && !loading && (
                <div className="absolute -top-6 right-0 flex items-center gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <CopyButton text={scopes.join(',')} />
                            </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Copy all</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="button" size="icon" variant="ghost" onClick={() => void deleteAllScopes()}>
                                <Trash2 />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Delete all</TooltipContent>
                    </Tooltip>
                </div>
            )}
            <Combobox
                items={availableScopes ?? []}
                multiple
                value={scopes}
                inputValue={inputValue}
                onValueChange={(newScopes) => void onValueChange(newScopes)}
                disabled={loading}
                open={hasAvailableScopesDropdown ? dropdownOpen : false}
                onOpenChange={setDropdownOpen}
            >
                <ComboboxChips ref={chipsRef} className={cn('px-1.5 gap-1 min-h-9')}>
                    {scopes.length > 0 && (
                        <ComboboxValue>
                            {scopes.map((scope) => (
                                <ComboboxChip key={scope}>{scope}</ComboboxChip>
                            ))}
                        </ComboboxValue>
                    )}
                    <ComboboxChipsInput
                        placeholder={scopes.length === 0 ? finalPlaceholder : ''}
                        value={inputValue}
                        onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => void handleKeyDown(e)}
                        onPaste={(e) => void handlePaste(e)}
                        onFocus={() => hasAvailableScopesDropdown && setDropdownOpen(true)}
                    />
                    <div className="ml-auto flex items-center gap-1 shrink-0 pl-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button type="button" size="icon" variant="ghost" loading={loading} onClick={() => void addScopesFromText(inputValue)}>
                                    <CornerDownLeft />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Add scope</TooltipContent>
                        </Tooltip>
                    </div>
                </ComboboxChips>
                {hasAvailableScopesDropdown && (
                    <ComboboxContent
                        anchor={chipsRef}
                        sideOffset={0}
                        collisionAvoidance={{ side: 'none' }}
                        className="rounded-t-none shadow-none ring-0 border border-t-0 border-border-muted bg-bg-subtle flex flex-col"
                    >
                        <ComboboxList className="p-0 flex-1 min-h-0 max-h-none">
                            {inputValue.trim() && (
                                <button
                                    type="button"
                                    onClick={() => void addScopesFromText(inputValue)}
                                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:bg-dropdown-bg-hover hover:text-text-primary shrink-0"
                                >
                                    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-bg-elevated px-2 text-xs font-medium text-text-primary shrink-0">
                                        <Plus className="size-3.5" />
                                        Add
                                    </span>
                                    <span>
                                        <span className="font-medium text-text-primary">&quot;{inputValue.trim()}&quot;</span> as a new scope
                                    </span>
                                </button>
                            )}
                            {filteredSuggestions.length > 0 && <p className="px-2 py-1.5 text-sm text-text-tertiary">Suggested scopes</p>}
                            <ComboboxCollection>
                                {(scope) => (
                                    <ComboboxItem key={scope as string} value={scope} className="rounded-none px-2">
                                        {scope as string}
                                    </ComboboxItem>
                                )}
                            </ComboboxCollection>
                        </ComboboxList>
                    </ComboboxContent>
                )}
            </Combobox>
        </div>
    );
};
