import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '@/utils/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            className={cn(
                'peer data-[state=checked]:bg-feedback-success-fg data-[state=unchecked]:bg-bg-subtle focus-visible:border-neutral-950 focus-visible:ring-neutral-950/50  inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-neutral-200 border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 ',
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className={cn(
                    'bg-white dark:data-[state=unchecked]:bg-bg-white pointer-events-none block size-4 rounded-full shadow ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 '
                )}
            />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
