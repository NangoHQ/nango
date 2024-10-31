import { useMemo } from 'react';

import { toAcronym } from '../utils/avatar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/Avatar';
import { globalEnv } from '../utils/env';

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

interface OrgProps {
    email?: string | null;
    displayName: string;
}

const knownEmailsProviders = new Set<string>([
    'aol.com',
    'duck.com',
    'example.com',
    'free.fr',
    'gmail.com',
    'gmx.de',
    'googlemail.com',
    'hey.com',
    'hotmail.co.uk',
    'hotmail.com',
    'hotmail.fr',
    'icloud.com',
    'live.com',
    'mailinator.com',
    'me.com',
    'orange.fr',
    'outlook.com',
    'proton.me',
    'protonmail.com',
    'qq.com',
    'yahoo.co.uk',
    'yahoo.com'
]);
export const AvatarOrganization: React.FC<OrgProps> = ({ email, displayName }) => {
    const acronym = useMemo(() => {
        if (email && globalEnv.publicLogoDevKey) {
            const domain = email.split('@')[1];
            if (!knownEmailsProviders.has(domain)) {
                return { type: 'domain', display: toAcronym(domain), full: domain };
            }
        }
        return { type: 'name', display: toAcronym(displayName) };
    }, [email, displayName]);

    return (
        <Avatar data-avatar>
            {acronym.type === 'domain' && (
                <AvatarImage src={`https://img.logo.dev/${acronym.full}?size=80&token=${globalEnv.publicLogoDevKey}`} className="p-2" />
            )}
            <AvatarFallback delayMs={0}>{acronym.display}</AvatarFallback>
        </Avatar>
    );
};
