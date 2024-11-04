import { useMemo } from 'react';

import { toAcronym } from '../utils/avatar';
import type { AvatarProps } from './ui/Avatar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/Avatar';
import { globalEnv } from '../utils/env';

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

type OrgProps = {
    email?: string | null;
    displayName: string;
} & AvatarProps;

const knownEmailProviders = new Set<string>([
    'aim.com',
    'alice.it',
    'aliceadsl.fr',
    'aol.com',
    'arcor.de',
    'att.net',
    'bellsouth.net',
    'bigpond.com',
    'bigpond.net.au',
    'bluewin.ch',
    'blueyonder.co.uk',
    'bol.com.br',
    'centurytel.net',
    'charter.net',
    'chello.nl',
    'club-internet.fr',
    'comcast.net',
    'cox.net',
    'duck.com',
    'earthlink.net',
    'example.com',
    'facebook.com',
    'free.fr',
    'freenet.de',
    'frontiernet.net',
    'gmail.com',
    'gmx.de',
    'gmx.net',
    'googlemail.com',
    'hetnet.nl',
    'hey.com',
    'home.nl',
    'hotmail.co.uk',
    'hotmail.com',
    'hotmail.de',
    'hotmail.es',
    'hotmail.fr',
    'hotmail.it',
    'icloud.com',
    'ig.com.br',
    'juno.com',
    'laposte.net',
    'libero.it',
    'live.ca',
    'live.co.uk',
    'live.com.au',
    'live.com',
    'live.fr',
    'live.it',
    'live.nl',
    'mac.com',
    'mail.com',
    'mail.ru',
    'mailinator.com',
    'me.com',
    'msn.com',
    'neuf.fr',
    'ntlworld.com',
    'optonline.net',
    'optusnet.com.au',
    'orange.fr',
    'outlook.com',
    'planet.nl',
    'proton.me',
    'protonmail.com',
    'qq.com',
    'rambler.ru',
    'rediffmail.com',
    'rocketmail.com',
    'sbcglobal.net',
    'sfr.fr',
    'shaw.ca',
    'sky.com',
    'skynet.be',
    'sympatico.ca',
    't-online.de',
    'telenet.be',
    'terra.com.br',
    'tin.it',
    'tiscali.co.uk',
    'tiscali.it',
    'uol.com.br',
    'verizon.net',
    'virgilio.it',
    'voila.fr',
    'wanadoo.fr',
    'web.de',
    'windstream.net',
    'yahoo.ca',
    'yahoo.co.id',
    'yahoo.co.in',
    'yahoo.co.jp',
    'yahoo.co.uk',
    'yahoo.co.uk',
    'yahoo.com.ar',
    'yahoo.com.au',
    'yahoo.com.br',
    'yahoo.com.mx',
    'yahoo.com.sg',
    'yahoo.com',
    'yahoo.de',
    'yahoo.es',
    'yahoo.fr',
    'yahoo.in',
    'yahoo.it',
    'yandex.ru',
    'ymail.com',
    'zonnet.nl'
]);
export const AvatarOrganization: React.FC<OrgProps> = ({ email, displayName, ...props }) => {
    const acronym = useMemo(() => {
        if (email && globalEnv.publicLogoDevKey) {
            const domain = email.split('@')[1];
            if (!knownEmailProviders.has(domain)) {
                return { type: 'domain', display: toAcronym(domain), full: domain };
            }
        }
        return { type: 'name', display: toAcronym(displayName) };
    }, [email, displayName]);

    return (
        <Avatar data-avatar {...props}>
            {acronym.type === 'domain' && (
                <AvatarImage src={`https://img.logo.dev/${acronym.full}?size=80&token=${globalEnv.publicLogoDevKey}`} className="p-1.5" />
            )}
            <AvatarFallback delayMs={0}>{acronym.display}</AvatarFallback>
        </Avatar>
    );
};
