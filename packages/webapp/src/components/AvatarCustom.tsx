import { useMemo } from 'react';

import { toAcronym } from '../utils/avatar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/Avatar';

interface Props {
    displayName: string;
}

export const AvatarCustom: React.FC<Props> = ({ displayName }) => {
    const acronym = useMemo(() => {
        return toAcronym(displayName);
    }, [displayName]);

    return (
        <Avatar data-avatar>
            <AvatarImage />
            <AvatarFallback delayMs={0}>{acronym}</AvatarFallback>
        </Avatar>
    );
};
