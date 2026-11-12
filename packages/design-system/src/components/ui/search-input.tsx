import { Search, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/cn';
import { useFieldContext } from './field-context';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupKbd } from './input-group';

import type { InputGroupInputProps, InputGroupProps } from './input-group';

export interface SearchInputProps extends Omit<InputGroupInputProps, 'size' | 'type'> {
    size?: Extract<InputGroupProps['size'], 'md' | 'sm'>;
    /** Called with the new value on typing and on clear. `onChange` also fires on clear. */
    onValueChange?: (value: string) => void;
    /**
     * Focus the field when "/" is pressed anywhere on the page (ignored while typing in another field).
     * Turn off when several SearchInputs are on screen.
     * @default true
     */
    shortcut?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

// Sets the value the way a user would, so React's onChange fires for controlled and uncontrolled inputs alike.
// Going through the prototype's setter (receiver = input) skips React's own value tracker, which would swallow the event.
export function setNativeValue(input: HTMLInputElement, value: string) {
    Reflect.set(HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Search field: Search icon at the start, a "/" hint at the end that becomes a Clear button once there's a value.
 * "/" focuses it, Esc clears it (and blurs it when already empty).
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
    (
        {
            size = 'md',
            value,
            defaultValue,
            onChange,
            onValueChange,
            onKeyDown,
            shortcut = true,
            placeholder = 'Search',
            disabled,
            readOnly,
            className,
            'aria-label': ariaLabel,
            ...props
        },
        forwardedRef
    ) => {
        const innerRef = React.useRef<HTMLInputElement>(null);
        React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);
        const [uncontrolled, setUncontrolled] = React.useState(() => (defaultValue === undefined ? '' : String(defaultValue)));
        const current = value === undefined ? uncontrolled : String(value);
        const field = useFieldContext();
        const clearable = !disabled && !readOnly;
        // A FieldLabel or aria-labelledby already names the input, and an aria-label would override it.
        const namedElsewhere = Boolean(field) || props['aria-labelledby'] !== undefined;
        const placeholderLabel = typeof placeholder === 'string' ? placeholder : 'Search';

        React.useEffect(() => {
            if (!shortcut || disabled) {
                return;
            }
            const onKey = (e: KeyboardEvent) => {
                if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) {
                    return;
                }
                e.preventDefault();
                innerRef.current?.focus();
            };
            document.addEventListener('keydown', onKey);
            return () => document.removeEventListener('keydown', onKey);
        }, [shortcut, disabled]);

        const clear = () => {
            if (innerRef.current) {
                setNativeValue(innerRef.current, '');
                innerRef.current.focus();
            }
        };

        return (
            <InputGroup size={size}>
                <InputGroupAddon>
                    <Search />
                </InputGroupAddon>
                <InputGroupInput
                    ref={innerRef}
                    type="search"
                    // The native search clear (×) duplicates ours
                    className={cn('[&::-webkit-search-cancel-button]:appearance-none', className)}
                    aria-label={ariaLabel ?? (namedElsewhere ? undefined : placeholderLabel)}
                    placeholder={placeholder}
                    value={value}
                    defaultValue={defaultValue}
                    disabled={disabled}
                    readOnly={readOnly}
                    onChange={(e) => {
                        if (value === undefined) {
                            setUncontrolled(e.target.value);
                        }
                        onChange?.(e);
                        onValueChange?.(e.target.value);
                    }}
                    onKeyDown={(e) => {
                        onKeyDown?.(e);
                        if (e.defaultPrevented || e.key !== 'Escape') {
                            return;
                        }
                        if (current && clearable) {
                            e.preventDefault();
                            clear();
                        } else if (!current) {
                            e.currentTarget.blur();
                        }
                    }}
                    {...props}
                />
                <InputGroupAddon align="inline-end">
                    {current ? (
                        <InputGroupButton label="Clear search" disabled={!clearable} onClick={clear}>
                            <X />
                        </InputGroupButton>
                    ) : (
                        shortcut && <InputGroupKbd aria-hidden>/</InputGroupKbd>
                    )}
                </InputGroupAddon>
            </InputGroup>
        );
    }
);
SearchInput.displayName = 'SearchInput';
