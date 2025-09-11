import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { IconCheck } from '@tabler/icons-react';
import { forwardRef } from 'react';

import { cn } from '../../utils/utils';

const Checkbox = forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
    ({ className, ...props }, ref) => (
        <CheckboxPrimitive.Root
            ref={ref}
            className={cn(
                'peer h-4 w-4 shrink-0 rounded-xs border border-primary shadow-sm focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground text-white',
                className
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
                <IconCheck size={14} />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    )
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
