import { ChevronDown } from 'lucide-react';
import { createContext, forwardRef, useContext, useMemo } from 'react';

import { cn } from '../../lib/cn';
import { Button, IconButton } from './button';

import type { ButtonProps, IconButtonProps } from './button';

/** SplitButton types — the filled and outlined Button palettes. */
export const SPLIT_BUTTON_VARIANTS = ['primary', 'secondary', 'outline'] as const;
/** Same heights as Button / IconButton: xs 24 · sm 28 · md 32 · lg 36. */
export const SPLIT_BUTTON_SIZES = ['xs', 'sm', 'md', 'lg'] as const;

export type SplitButtonVariant = (typeof SPLIT_BUTTON_VARIANTS)[number];
export type SplitButtonSize = (typeof SPLIT_BUTTON_SIZES)[number];

interface SplitButtonContextValue {
    variant: SplitButtonVariant;
    size: SplitButtonSize;
    disabled: boolean;
}

const SplitButtonContext = createContext<SplitButtonContextValue | null>(null);

function useSplitButton(component: string): SplitButtonContextValue {
    const context = useContext(SplitButtonContext);
    if (!context) {
        throw new Error(`<${component}> must be rendered inside <SplitButton>`);
    }
    return context;
}

// Shared by both halves. Each half is a full Button / IconButton with its own hover, pressed and focus states;
// the one being hovered or focused is lifted above its neighbour, so its focus ring (and, for outline, its
// darker hover border) isn't painted over by the other half.
const HALF_CLASSES = 'relative hover:z-10 focus-visible:z-10';

// The menu half shows the pressed fill while its menu is open (Radix sets aria-expanded on the trigger).
const OPEN_CLASSES: Record<SplitButtonVariant, string> = {
    primary: 'aria-expanded:bg-interactive-primary-active',
    secondary: 'aria-expanded:bg-surface-inverse-pressed',
    outline: 'aria-expanded:bg-interactive-outline-active'
};

// ─── SplitButton ──────────────────────────────────────────────────────────────

export interface SplitButtonProps extends React.HTMLAttributes<HTMLDivElement> {
    /** primary | secondary | outline. */
    variant?: SplitButtonVariant;
    /** xs 24 · sm 28 · md 32 · lg 36. */
    size?: SplitButtonSize;
    /** Disables both halves. */
    disabled?: boolean;
}

/**
 * A main action plus a chevron that opens a menu of related actions. Compose it from `SplitButtonAction` and
 * `SplitButtonMenuTrigger`; the trigger forwards its ref and props, so it drops into any menu trigger:
 *
 * ```tsx
 * <SplitButton variant="primary">
 *     <SplitButtonAction onClick={deploy}>Deploy</SplitButtonAction>
 *     <DropdownMenu>
 *         <DropdownMenuTrigger asChild>
 *             <SplitButtonMenuTrigger label="More deploy options" />
 *         </DropdownMenuTrigger>
 *         <DropdownMenuContent align="end">…</DropdownMenuContent>
 *     </DropdownMenu>
 * </SplitButton>
 * ```
 *
 * Filled types keep a 1px gap between the halves; outline overlaps them so they share one border.
 */
export const SplitButton = forwardRef<HTMLDivElement, SplitButtonProps>(({ className, variant = 'primary', size = 'md', disabled = false, ...props }, ref) => {
    const value = useMemo(() => ({ variant, size, disabled }), [variant, size, disabled]);

    return (
        <SplitButtonContext.Provider value={value}>
            <div ref={ref} role="group" className={cn('inline-flex items-stretch', variant === 'outline' ? 'gap-0' : 'gap-px', className)} {...props} />
        </SplitButtonContext.Provider>
    );
});

SplitButton.displayName = 'SplitButton';

// ─── SplitButtonAction ────────────────────────────────────────────────────────

/** The main half. Type and size come from the parent `SplitButton`. */
export type SplitButtonActionProps = Omit<ButtonProps, 'variant' | 'size'>;

export const SplitButtonAction = forwardRef<HTMLButtonElement, SplitButtonActionProps>(
    ({ className, disabled, loading, asChild, onClickCapture, ...props }, ref) => {
        const { variant, size, disabled: groupDisabled } = useSplitButton('SplitButtonAction');
        const isDisabled = groupDisabled || disabled || loading;
        // Same guard as IconButton: pointer-events-none only stops the mouse, so a disabled slotted link could still
        // be activated with Enter or a programmatic click. Capturing the click first blocks both navigation and the
        // child's own onClick.
        const handleClickCapture = (event: React.MouseEvent<HTMLButtonElement>) => {
            if (isDisabled && asChild) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            onClickCapture?.(event);
        };

        return (
            <Button
                ref={ref}
                variant={variant}
                size={size}
                asChild={asChild}
                loading={loading}
                disabled={groupDisabled || disabled}
                // square inner corners: the right edge meets the menu half
                className={cn(HALF_CLASSES, 'rounded-r-none', className)}
                {...props}
                onClickCapture={handleClickCapture}
            />
        );
    }
);

SplitButtonAction.displayName = 'SplitButtonAction';

// ─── SplitButtonMenuTrigger ───────────────────────────────────────────────────

// `loading` is omitted: a spinner would replace the chevron and disable the trigger. Show loading on the main half.
export interface SplitButtonMenuTriggerProps extends Omit<IconButtonProps, 'variant' | 'size' | 'label' | 'children' | 'asChild' | 'loading'> {
    /** Accessible name for the chevron. Defaults to "More options" — prefer naming what the menu holds. */
    label?: string;
}

/** The chevron half. Type and size come from the parent `SplitButton`; wrap it in a menu trigger with `asChild`. */
export const SplitButtonMenuTrigger = forwardRef<HTMLButtonElement, SplitButtonMenuTriggerProps>(
    ({ className, disabled, label = 'More options', ...props }, ref) => {
        const { variant, size, disabled: groupDisabled } = useSplitButton('SplitButtonMenuTrigger');

        return (
            <IconButton
                ref={ref}
                variant={variant}
                size={size}
                label={label}
                disabled={groupDisabled || disabled}
                aria-haspopup="menu"
                className={cn(
                    HALF_CLASSES,
                    // square inner corners: the left edge meets the main half
                    'rounded-l-none',
                    // outline: pull the trigger 1px over the main half so the two borders collapse into one
                    variant === 'outline' && '-ml-px',
                    OPEN_CLASSES[variant],
                    className
                )}
                {...props}
            >
                <ChevronDown />
            </IconButton>
        );
    }
);

SplitButtonMenuTrigger.displayName = 'SplitButtonMenuTrigger';
