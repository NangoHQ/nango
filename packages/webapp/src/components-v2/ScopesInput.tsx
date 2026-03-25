import { Copy, CornerDownLeft, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from './ui/badge.js';
import {
    Combobox,
    ComboboxChip,
    ComboboxChips,
    ComboboxChipsInput,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxItem,
    ComboboxList,
    ComboboxValue
} from './ui/combobox.js';

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
        setLoading(true);
        try {
            await onChange?.(newScopes.join(','), countDifference);
            setScopes(newScopes);
        } finally {
            setLoading(false);
        }
    };

    const copyScopes = () => {
        void navigator.clipboard.writeText(scopes.join(','));
    };

    const [inputValue, setInputValue] = useState('');

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
        if (!text.includes(',')) return;
        e.preventDefault();
        await addScopesFromText(text);
    };

    const hasAvailableScopesDropdown = showAvailableScopesDropdown && !!availableScopes?.length && !isSharedCredentials && !readOnly;
    const finalPlaceholder = placeholder ?? (isSharedCredentials ? '' : 'Add new scope');

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
                    {loading ? (
                        <Loader2 size={14} className="animate-spin text-text-secondary" />
                    ) : isSharedCredentials ? (
                        <Badge variant="gray">Nango provided</Badge>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="relative mb-8 min-w-0">
            {scopes.length > 0 && !loading && (
                <button
                    type="button"
                    onClick={copyScopes}
                    className="absolute -top-6 right-0 text-text-tertiary hover:text-text-primary flex items-center gap-1 text-xs p-0.5"
                >
                    <Copy size={12} />
                </button>
            )}
            <Combobox
                items={availableScopes ?? []}
                multiple
                value={scopes}
                onValueChange={(newScopes) => void onValueChange(newScopes)}
                disabled={loading}
                open={hasAvailableScopesDropdown ? undefined : false}
            >
                <ComboboxChips ref={chipsRef}>
                    <ComboboxValue>
                        {scopes.map((scope) => (
                            <ComboboxChip key={scope}>{scope}</ComboboxChip>
                        ))}
                    </ComboboxValue>
                    <ComboboxChipsInput
                        placeholder={scopes.length === 0 ? finalPlaceholder : ''}
                        value={inputValue}
                        onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
                        onKeyDown={(e) => void handleKeyDown(e)}
                        onPaste={(e) => void handlePaste(e)}
                    />
                    <div className="ml-auto flex items-center gap-1 shrink-0 pl-1">
                        {loading ? (
                            <Loader2 size={14} className="animate-spin text-text-secondary" />
                        ) : (
                            <button
                                type="button"
                                onClick={() => void addScopesFromText(inputValue)}
                                className="text-text-tertiary hover:text-text-primary flex items-center p-0.5"
                            >
                                <CornerDownLeft size={14} />
                            </button>
                        )}
                    </div>
                </ComboboxChips>
                {hasAvailableScopesDropdown && (
                    <ComboboxContent
                        anchor={chipsRef}
                        sideOffset={0}
                        className="rounded-t-none shadow-none ring-0 border border-t-0 border-border-muted bg-bg-subtle mb-2"
                    >
                        <ComboboxEmpty>No results found.</ComboboxEmpty>
                        <ComboboxList className="p-0">
                            {(scope) => (
                                <ComboboxItem key={scope as string} value={scope} className="rounded-none px-2">
                                    {scope as string}
                                </ComboboxItem>
                            )}
                        </ComboboxList>
                    </ComboboxContent>
                )}
            </Combobox>
        </div>
    );
};
