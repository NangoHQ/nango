import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';

import { cn } from '../../lib/cn';

export type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>;

const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(({ className, ...props }, ref) => (
    <LabelPrimitive.Root
        ref={ref}
        data-slot="label"
        className={cn(
            // Layout — inline so a label can sit beside an icon, tooltip, or required asterisk (Figma space/2 gap)
            'flex items-center gap-2 select-none',
            // Typography (Figma text/medium/md)
            'text-text-strong text-ds-md font-ds-medium leading-ds-normal',
            // Disabled affordances driven by an ancestor [data-disabled] or a peer :disabled control
            'group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
            className
        )}
        {...props}
    />
));
Label.displayName = 'Label';

export { Label };
