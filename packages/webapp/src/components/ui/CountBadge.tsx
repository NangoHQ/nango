import { cn } from '@/utils/utils';

export const CountBadge: React.FC<{ count: number; total?: number; tone?: 'inset' | 'panel' }> = ({ count, total, tone = 'inset' }) => (
    <span
        className={cn('rounded-ds-sm px-1.5 py-0.5 type-code-regular-xs text-text-secondary', tone === 'inset' ? 'bg-surface-panel-inset' : 'bg-surface-panel')}
    >
        {count.toLocaleString('en-US')}
        {total !== undefined && ` / ${total.toLocaleString('en-US')}`}
    </span>
);
