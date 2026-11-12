import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { CopyButton } from './copy-button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { InputGroupInputProps, InputGroupProps } from './input-group';

/** Characters kept visible at the end of a masked secret. */
const VISIBLE_SUFFIX = 3;
/** Fixed mask length, so the mask doesn't leak the secret's length. */
const MASK_LENGTH = 20;

export function maskSecret(value: string): string {
    if (value.length <= VISIBLE_SUFFIX) {
        return '•'.repeat(MASK_LENGTH);
    }
    return '•'.repeat(MASK_LENGTH) + value.slice(-VISIBLE_SUFFIX);
}

export interface SecretInputProps extends Omit<InputGroupInputProps, 'value' | 'defaultValue' | 'readOnly' | 'onChange' | 'size' | 'type'> {
    value: string;
    size?: Extract<InputGroupProps['size'], 'md' | 'sm'>;
    /**
     * Whether the viewer may see the secret. When false, the reveal and copy buttons are hidden and the value stays masked.
     * @default true
     */
    canReveal?: boolean;
    onCopy?: () => void;
}

/**
 * Read-only secret (API keys, signing secrets). Masked by default with the last 3 characters visible;
 * reveal / hide and copy sit at the end. For an *editable* secret field, use InputGroup + InputGroupInput type="password".
 */
export const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
    ({ value, size = 'md', mono = true, canReveal = true, onCopy, disabled, ...props }, ref) => {
        const [revealed, setRevealed] = React.useState(false);
        const isRevealed = canReveal && revealed;
        const revealLabel = isRevealed ? 'Hide secret' : 'Show secret';

        return (
            <InputGroup size={size}>
                <InputGroupInput ref={ref} readOnly mono={mono} value={isRevealed ? value : maskSecret(value)} disabled={disabled} {...props} />
                {canReveal && (
                    <InputGroupAddon align="inline-end">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <InputGroupButton
                                    label="Show secret"
                                    title=""
                                    aria-pressed={isRevealed}
                                    disabled={disabled}
                                    onClick={() => setRevealed((r) => !r)}
                                >
                                    {isRevealed ? <EyeOff /> : <Eye />}
                                </InputGroupButton>
                            </TooltipTrigger>
                            <TooltipContent side="top">{revealLabel}</TooltipContent>
                        </Tooltip>
                        <CopyButton text={value} onCopy={onCopy} disabled={disabled} />
                    </InputGroupAddon>
                )}
            </InputGroup>
        );
    }
);
SecretInput.displayName = 'SecretInput';
