import { CubeTransparentIcon, LockOpenIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { cn } from '@/utils/utils';

interface IntegrationLogoProps {
    provider: string;
    className?: string;
}

export const IntegrationLogo = ({ provider, className }: IntegrationLogoProps) => {
    const [imgError, setImgError] = useState(false);

    return (
        <div className={cn(`p-1 size-8 rounded-sm flex items-center justify-center bg-white border-[0.5px] border-border-muted`, className)}>
            {provider === 'unauthenticated' ? (
                <LockOpenIcon className={`size-full text-black stroke-2`} />
            ) : !imgError ? (
                <img
                    src={`/images/template-logos/${provider}.svg`}
                    alt={`${provider} logo`}
                    className={`size-full object-contain`}
                    onError={() => setImgError(true)}
                />
            ) : (
                <CubeTransparentIcon className={`size-full`} />
            )}
        </div>
    );
};
