import { useState } from 'react';
import { SquaresPlusIcon } from '@heroicons/react/24/outline';

interface IntegrationLogoProps {
    provider: string;
    height?: number;
    width?: number;
    color?: string;
    classNames?: string;
}

export default function IntegrationLogo({ provider, height = 5, width = 5, color = 'text-white', classNames = '' }: IntegrationLogoProps) {
    const [imgError, setImgError] = useState(false);

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
                <SquaresPlusIcon className={`h-${height} w-${width} ${color} ${classNames}`} />
            )}
        </>
    );
}
