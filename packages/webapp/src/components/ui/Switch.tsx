import * as SwitchPrimitives from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '../../utils/utils';

const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitives.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>>(
    ({ className, ...props }, ref) => (
        <SwitchPrimitives.Root
            className={cn(
                'peer inline-flex h-[20px] w-[34px] shrink-0 cursor-pointer items-center rounded-full border border-grayscale-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-success-400 data-[state=unchecked]:bg-input data-[state=checked]:border-success-400',
                className
            )}
            {...props}
            ref={ref}
        >
            <SwitchPrimitives.Thumb
                className={cn(
                    'pointer-events-none block h-[16px] w-[16px] rounded-full bg-grayscale-400 shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-3.5 data-[state=unchecked]:translate-x-[1px] data-[state=checked]:bg-grayscale-1000 data-[state=checked]:h-[18px] data-[state=checked]:w-[18px]'
                )}
            />
        </SwitchPrimitives.Root>
    )
);
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
