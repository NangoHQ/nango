import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from 'input-otp';
import * as React from 'react';

import { cn } from '@/utils/utils';

function InputOTP({
    className,
    containerClassName,
    ...props
}: React.ComponentProps<typeof OTPInput> & {
    containerClassName?: string;
}) {
    return (
        <OTPInput
            data-slot="input-otp"
            inputMode="numeric"
            pattern={REGEXP_ONLY_DIGITS}
            aria-label="One-time password"
            containerClassName={cn('flex items-center gap-2 has-disabled:opacity-50', containerClassName)}
            className={cn('disabled:cursor-not-allowed', className)}
            {...props}
        />
    );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="input-otp-group" className={cn('flex items-center gap-2', className)} {...props} />;
}

function InputOTPSlot({ index, className, ...props }: React.ComponentProps<'div'> & { index: number }) {
    const inputOTPContext = React.useContext(OTPInputContext);
    const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

    return (
        <div
            data-slot="input-otp-slot"
            data-active={isActive}
            className={cn(
                'relative flex size-10 items-center justify-center rounded-ds-xs border-ds-hairline border-border-interactive bg-surface-input text-text-default text-ds-md font-ds-medium transition-[color,box-shadow]',
                'data-[active=true]:border-[var(--focus-ring-default)] data-[active=true]:shadow-[0_0_0_0.5px_var(--focus-ring-default),inset_0_0_0_0.5px_var(--focus-ring-default)] data-[active=true]:z-10',
                className
            )}
            {...props}
        >
            {char}
            {hasFakeCaret && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-4 w-px animate-pulse bg-text-default" />
                </div>
            )}
        </div>
    );
}

export { InputOTP, InputOTPGroup, InputOTPSlot };
