import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { Prism } from '@mantine/prism';
import classNames from 'classnames';
import { useCallback, useState } from 'react';

import type { PrismProps } from '@mantine/prism';

//just Prism component with some additional powers!

export default function PrismPlus({ children, ...props }: PrismProps) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible, setIsSecretVisible]);

    const Switch = useCallback(() => {
        return (
            <span onClick={toggleSecretVisibility} className="rounded px-1 py-1 text-sm text-gray-600 cursor-pointer absolute z-10 -top-7 right-3">
                {isSecretVisible ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
            </span>
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSecretVisible]);

    return (
        <div className="relative">
            {isSecretVisible ? (
                <Switch />
            ) : (
                <div className={classNames('absolute z-10', { 'h-full w-full backdrop-blur-sm bg-black/0': !isSecretVisible })}>
                    <Switch />
                </div>
            )}

            <Prism {...props}>{children}</Prism>
        </div>
    );
}
