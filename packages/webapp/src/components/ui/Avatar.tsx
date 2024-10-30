import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../../utils/utils';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

const avatarStyle = cva('', {
    variants: {
        size: {
            sm: 'h-8 w-8 text-sm',
            md: 'h-10 w-10'
        }
    },
    defaultVariants: {
        size: 'md'
    }
});
export type AvatarProps = React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & VariantProps<typeof avatarStyle>;

const Avatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Root
        ref={ref}
        className={cn(avatarStyle({ size: props.size }), 'relative flex shrink-0 overflow-hidden rounded-md', className)}
        {...props}
    />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Image>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>>(
    ({ className, ...props }, ref) => <AvatarPrimitive.Image ref={ref} className={cn('aspect-square h-full w-full bg-white', className)} {...props} />
);
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Fallback>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>>(
    ({ className, ...props }, ref) => (
        <AvatarPrimitive.Fallback
            ref={ref}
            className={cn('flex h-full w-full items-center justify-center rounded-md bg-white text-dark-600', className)}
            {...props}
        />
    )
);
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
