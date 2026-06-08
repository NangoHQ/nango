import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/utils/utils';

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            className={cn(
                'peer border-text-primary data-[state=checked]:bg-text-primary data-[state=checked]:text-surface focus-default aria-invalid:ring-red-500/20 aria-invalid:border-red-500 size-4 shrink-0 rounded-xs border transition-shadow outline-none  disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current transition-none">
                <CheckIcon className="size-3.5" />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}

export { Checkbox };
