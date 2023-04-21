import type { PrismProps } from '@mantine/prism';
import { Prism } from '@mantine/prism';
import classNames from 'classnames';
import { useCallback, useState } from 'react';

//just Prism component with some additional powers!

export default function PrismPlus({ children, ...props }: PrismProps) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible, setIsSecretVisible]);

    const Switch = useCallback(() => {
        return (
            <span
                onClick={toggleSecretVisibility}
                className="bg-gray-300 hover:bg-gray-400 rounded px-2 py-1 text-sm text-gray-600 cursor-pointer absolute z-10 top-3 right-10"
            >
                {isSecretVisible ? 'hide' : 'show'}
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
