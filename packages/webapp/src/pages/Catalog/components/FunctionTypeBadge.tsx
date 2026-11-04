import { Hammer, RefreshCw } from 'lucide-react';

import { Badge } from '@nangohq/design-system';

export const FunctionTypeBadge = ({ type }: { type: 'action' | 'sync' }) => {
    return (
        <Badge variant={type === 'action' ? 'warning' : 'success'}>
            <FunctionTypeGlyph type={type} />
            {type === 'action' ? 'Action' : 'Sync'}
        </Badge>
    );
};

const FunctionTypeGlyph = ({ type, className }: { type: 'action' | 'sync'; className?: string }) => {
    return type === 'action' ? <Hammer className={className} /> : <RefreshCw className={className} />;
};
