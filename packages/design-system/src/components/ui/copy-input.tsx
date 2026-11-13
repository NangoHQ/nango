import * as React from 'react';

import { CopyButton } from './copy-button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group';

import type { InputGroupInputProps, InputGroupProps } from './input-group';

export interface CopyInputProps extends Omit<InputGroupInputProps, 'value' | 'defaultValue' | 'readOnly' | 'onChange' | 'size'> {
    value: string;
    size?: Extract<InputGroupProps['size'], 'md' | 'sm'>;
    /** Accessible name and tooltip of the copy button. */
    copyLabel?: string;
    onCopy?: () => void;
}

/** Read-only value with a copy button — IDs, URLs, callback addresses. Mono by default. */
export const CopyInput = React.forwardRef<HTMLInputElement, CopyInputProps>(
    ({ value, size = 'md', mono = true, copyLabel, onCopy, disabled, ...props }, ref) => (
        <InputGroup size={size}>
            <InputGroupInput ref={ref} readOnly mono={mono} value={value} disabled={disabled} {...props} />
            <InputGroupAddon align="inline-end">
                <CopyButton text={value} label={copyLabel} onCopy={onCopy} disabled={disabled} />
            </InputGroupAddon>
        </InputGroup>
    )
);
CopyInput.displayName = 'CopyInput';
