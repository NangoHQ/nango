import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { cn } from '../utils/utils';
import type { NangoSyncEndpointV2 } from '@nangohq/types';

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
const sizesMethod = cva('text-[11px]', {
    variants: {
        size: { xs: '', xl: 'text-base' },
        defaultVariants: { size: 'xs' }
    }
});
type Sizes = VariantProps<typeof sizesMethod>['size'];

const sizesText = cva('text-[13px]', {
    variants: {
        size: { xs: '', xl: 'text-base' },
        defaultVariants: { size: 'xs' }
    }
});

export const HttpLabel: React.FC<NangoSyncEndpointV2 & { size?: Sizes }> = ({ method, path, size }) => {
    return (
        <div className={cn('flex items-center gap-2')}>
            <div className={cn(styles({ bg: method }), sizesMethod({ size }), 'py-[1px] px-1.5 rounded')}>
                <span className={cn(styles({ text: method }), 'font-semibold')}>{method}</span>
            </div>
            <span className={cn(sizesText({ size }), 'break-all font-code')}>{path}</span>
        </div>
    );
};
