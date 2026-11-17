import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState } from 'react';

import { CopyButton } from './copy-button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

import type { InputProps } from './input';

const VISIBLE_SUFFIX = 3;
// Fixed, so the mask doesn't leak how long the secret is.
const MASK_LENGTH = 20;

function maskSecret(value: string, showSuffix: boolean): string {
    if (!value) {
        return '';
    }
    const mask = '•'.repeat(MASK_LENGTH);
    if (!showSuffix || value.length <= VISIBLE_SUFFIX) {
        return mask;
    }
    return mask + value.slice(-VISIBLE_SUFFIX);
}

export interface SecretInputProps extends Omit<InputProps, 'type' | 'value' | 'defaultValue' | 'readOnly' | 'onCopy'> {
    value?: string;
    defaultValue?: string;
    /** A form field the user types into. Without it, the input shows a stored secret: masked, with reveal and copy. */
    editable?: boolean;
    /** When false, the value stays fully masked, and reveal and copy are disabled with `disabledReason` as a tooltip. */
    canReveal?: boolean;
    disabledReason?: string;
    onCopy?: (value: string) => void;
}

export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(
    ({ value, defaultValue, editable = false, canReveal = true, disabledReason, onCopy, disabled, ...props }, ref) => {
        const [revealed, setRevealed] = useState(false);
        const isRevealed = canReveal && revealed;
        const revealLabel = isRevealed ? 'Hide secret' : 'Show secret';
        const buttonsDisabled = disabled || !canReveal;

        const revealButton = (
            <Tooltip>
                <TooltipTrigger asChild>
                    <InputGroupButton label="Show secret" title="" aria-pressed={isRevealed} disabled={buttonsDisabled} onClick={() => setRevealed((r) => !r)}>
                        {isRevealed ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent side="top">{revealLabel}</TooltipContent>
            </Tooltip>
        );

        if (editable) {
            return (
                <InputGroup>
                    <InputGroupInput
                        ref={ref}
                        type={isRevealed ? 'text' : 'password'}
                        value={value}
                        defaultValue={defaultValue}
                        disabled={disabled}
                        {...props}
                    />
                    <InputGroupAddon align="inline-end">{revealButton}</InputGroupAddon>
                </InputGroup>
            );
        }

        const secret = value ?? defaultValue ?? '';
        const buttons = (
            <>
                {revealButton}
                <CopyButton value={secret} label="Copy secret" onCopy={onCopy} disabled={buttonsDisabled} />
            </>
        );

        return (
            <InputGroup>
                <InputGroupInput ref={ref} readOnly value={isRevealed ? secret : maskSecret(secret, canReveal)} disabled={disabled} {...props} />
                <InputGroupAddon align="inline-end">
                    {!canReveal && disabledReason ? (
                        // disabled buttons get no pointer events, so the tooltip hangs on a wrapper
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="flex items-center gap-1">{buttons}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top">{disabledReason}</TooltipContent>
                        </Tooltip>
                    ) : (
                        buttons
                    )}
                </InputGroupAddon>
            </InputGroup>
        );
    }
);
SecretInput.displayName = 'SecretInput';
