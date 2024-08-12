import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '../utils/utils';
import type { HTTP_VERB } from '@nangohq/types';

const styles = cva('', {
    variants: {
        bg: {
            GET: 'bg-green-base-35',
            POST: 'bg-blue-base-35',
            PUT: 'bg-yellow-base-35',
            PATCH: 'bg-orange-base-35',
            DELETE: 'bg-red-base-35'
        },
        text: {
            GET: 'text-green-base',
            POST: 'text-blue-base',
            PUT: 'text-yellow-base',
            PATCH: 'text-orange-base',
            DELETE: 'text-red-base'
        }
    }
});
const sizesVerb = cva('', {
    variants: {
        size: { xs: 'text-[11px]', xl: 'text-base' },
        defaultVariants: { size: 'xs' }
    }
});
type Sizes = VariantProps<typeof sizesVerb>['size'];

const sizesText = cva('', {
    variants: {
        size: { xs: 'text-sm', xl: 'text-base' },
        defaultVariants: { size: 'xs' }
    }
});

export const HttpLabel: React.FC<{ verb: HTTP_VERB; path: string; size?: Sizes }> = ({ verb, path, size }) => {
    return (
        <div className={cn('flex items-center gap-2')}>
            <div className={cn(styles({ bg: verb }), sizesVerb({ size }), 'py-0.5 px-2 rounded')}>
                <span className={cn(styles({ text: verb }), 'font-semibold')}>{verb}</span>
            </div>
            <span className={cn(sizesText({ size }), 'break-all font-code')}>{path}</span>
        </div>
    );
};
