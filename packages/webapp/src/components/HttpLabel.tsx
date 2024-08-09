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

export const HttpLabel: React.FC<{ verb: HTTP_VERB; path: string }> = ({ verb, path }) => {
    return (
        <div className="flex items-center gap-2 text-[11px]">
            <div className={cn(styles({ bg: verb }), 'py-0.5 px-2 rounded')}>
                <span className={cn(styles({ text: verb }), 'font-semibold')}>{verb}</span>
            </div>
            <span className="break-all text-sm">{path}</span>
        </div>
    );
};
