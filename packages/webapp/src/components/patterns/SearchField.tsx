import { Search, X } from 'lucide-react';
import { useRef } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@nangohq/design-system';

import { useSlashToFocus } from '@/hooks/useSlashToFocus';

interface SearchFieldProps {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
}

export const SearchField: React.FC<SearchFieldProps> = ({ value, placeholder, onChange }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useSlashToFocus(inputRef);

    return (
        <InputGroup>
            <InputGroupAddon>
                <Search />
            </InputGroupAddon>
            <InputGroupInput ref={inputRef} type="text" placeholder={placeholder} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
            <InputGroupAddon align="inline-end">
                {value ? (
                    <InputGroupButton
                        label="Clear search"
                        onClick={() => {
                            onChange('');
                            inputRef.current?.focus();
                        }}
                    >
                        <X />
                    </InputGroupButton>
                ) : (
                    <span>
                        <kbd className="rounded-ds-xs border-ds-hairline border-border-default px-1.5 type-code-regular-xs text-text-muted">/</kbd>
                    </span>
                )}
            </InputGroupAddon>
        </InputGroup>
    );
};
