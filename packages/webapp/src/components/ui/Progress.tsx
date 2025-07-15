import * as ProgressPrimitive from '@radix-ui/react-progress';
import { forwardRef } from 'react';

import { cn } from '../../utils/utils';

const Progress = forwardRef<
    React.ElementRef<typeof ProgressPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { bgBar?: string }
>(({ className, value, bgBar, ...props }, ref) => (
    <ProgressPrimitive.Root ref={ref} className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)} {...props}>
        <ProgressPrimitive.Indicator
            className={cn('h-full w-full flex-1 bg-primary transition-all', bgBar)}
            style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        />
    </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
