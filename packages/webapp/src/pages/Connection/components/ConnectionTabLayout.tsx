import { ConnectionSideInfo } from './ConnectionSideInfo';
import { cn } from '@/utils/utils';

import type { GetConnection } from '@nangohq/types';

export const ConnectionTabLayout: React.FC<{
    connectionData: GetConnection['Success']['data'];
    children: React.ReactNode;
    contentClassName?: string;
}> = ({ connectionData, children, contentClassName }) => {
    return (
        <div className="flex w-full items-start justify-between gap-11">
            <div className={cn('w-full min-w-0', contentClassName)}>{children}</div>
            <ConnectionSideInfo connectionData={connectionData} />
        </div>
    );
};
