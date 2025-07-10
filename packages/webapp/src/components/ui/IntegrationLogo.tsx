import { CubeTransparentIcon, LockOpenIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

interface IntegrationLogoProps {
    provider: string;
    height?: number;
    width?: number;
    color?: string;
    classNames?: string;
}

export default function IntegrationLogo({ provider, height = 5, width = 5, color = 'text-white', classNames = '' }: IntegrationLogoProps) {
    const [imgError, setImgError] = useState(false);

    if (provider === 'unauthenticated') {
        return <LockOpenIcon className={`h-${height} w-${width} ${color} ${classNames}`} />;
    }

    return (
        <>
            {!imgError ? (
                <img
                    src={`/images/template-logos/${provider}.svg`}
                    alt=""
                    className={`h-${height} w-${width} ${classNames}`}
                    onError={() => setImgError(true)}
                />
            ) : (
                <CubeTransparentIcon className={`h-${height} w-${width} ${color} ${classNames}`} />
            )}
        </>
    );
}
