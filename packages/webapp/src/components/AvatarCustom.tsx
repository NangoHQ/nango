import { useMemo } from 'react';

import { toAcronym } from '../utils/avatar';
import type { AvatarProps } from './ui/Avatar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/Avatar';

type Props = {
    displayName: string;
} & AvatarProps;

export const AvatarCustom: React.FC<Props> = ({ displayName, ...props }) => {
    const acronym = useMemo(() => {
        return toAcronym(displayName);
    }, [displayName]);

    return (
        <Avatar data-avatar {...props}>
            <AvatarImage />
            <AvatarFallback delayMs={0}>{acronym}</AvatarFallback>
        </Avatar>
    );
};
