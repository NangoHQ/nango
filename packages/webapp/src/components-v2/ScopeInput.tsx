import { CornerDownLeft, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { cn } from '@/utils/utils';

function unique<T>(array: T[]): T[] {
    return Array.from(new Set(array));
}

interface ScopesInputProps {
    scopesString?: string | undefined;
    onChange?: (scopes: string, countDifference: number) => Promise<void>;
    isSharedCredentials?: boolean;
}

export const ScopesInput: React.FC<ScopesInputProps> = ({ scopesString, onChange, isSharedCredentials }) => {
    const [scopes, setScopes] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (scopesString) {
            setScopes(scopesString.split(',').map((scope) => scope.trim()));
        }
    }, [scopesString]);

    const onDelete = (index: number) => {
        setScopes((prev) => prev.filter((_, i) => i !== index));
        onChange?.(scopes.join(','), -1);
    };

    const onSubmit = async () => {
        if (isSharedCredentials) return;
        if (!inputValue.trim()) return;

        setLoading(true);

        const scopesToAdd = inputValue.split(/[,\s]+/).map((scope) => scope.trim());
        const newScopes = unique([...scopes, ...scopesToAdd]);
        const countDifference = newScopes.length - scopes.length;

        try {
            await onChange?.(newScopes.join(','), countDifference);
            setScopes(newScopes);
            setInputValue('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col">
            <InputGroup className={cn(scopes && scopes.length > 0 && 'rounded-b-none')}>
                <InputGroupInput
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                    disabled={loading || isSharedCredentials}
                    placeholder="Single, space-separated or comma-separated list of scopes"
                />

                <InputGroupAddon align="inline-end">
                    {loading ? (
                        <Loader2 className="animate-spin" />
                    ) : isSharedCredentials ? (
                        <Badge variant="gray">Nango provided</Badge>
                    ) : (
                        <Button variant="ghost" size="icon" onClick={() => onSubmit()}>
                            <CornerDownLeft />
                        </Button>
                    )}
                </InputGroupAddon>
            </InputGroup>
            {scopes?.map((scope, index) => (
                <ScopeItem key={scope} scope={scope} onDelete={() => onDelete(index)} isSharedCredentials={isSharedCredentials} />
            ))}
        </div>
    );
};

export const ScopeItem: React.FC<{ scope: string; onDelete: () => void; isSharedCredentials?: boolean }> = ({ scope, onDelete, isSharedCredentials }) => {
    return (
        <div className="flex items-center justify-between gap-2 h-9 bg-bg-subtle px-3 py-1 border-b border-border-disabled last:border-none last:rounded-b">
            <span className="text-body-medium-regular text-text-secondary">{scope}</span>
            {!isSharedCredentials && (
                <Button variant="ghost" size="icon" onClick={onDelete}>
                    <Trash2 />
                </Button>
            )}
        </div>
    );
};
