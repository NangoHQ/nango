import { forwardRef, useCallback, useState } from 'react';
import { EyeIcon, EyeSlashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import CopyButton from '../button/CopyButton';

type SecretInputProps = Omit<JSX.IntrinsicElements['input'], 'defaultValue'> & {
    copy?: boolean;
    defaultValue?: string;
    optionalvalue?: string | null;
    setoptionalvalue?: (value: string) => void;
    additionalclass?: string;
    tall?: boolean;
    refresh?: () => void;
};

const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function PasswordField(
    { className, copy, optionalvalue, setoptionalvalue, defaultValue, refresh, ...props },
    ref
) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const [changedValue, setChangedValue] = useState(defaultValue);

    const value = optionalvalue === null ? '' : optionalvalue || changedValue;
    const updateValue = setoptionalvalue || setChangedValue;

    const top = props.tall ? 'top-2.5' : 'top-0.5';

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible, setIsSecretVisible]);

    return (
        <div className={`relative flex ${props.additionalclass ?? ''}`}>
            <input
                type={isSecretVisible ? 'text' : 'password'}
                ref={ref}
                className={classNames(
                    'border-border-gray bg-active-gray text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-1 text-sm placeholder-gray-400 shadow-sm focus:outline-none',
                    className
                )}
                value={value || ''}
                onChange={(e) => updateValue(e.currentTarget.value)}
                {...props}
            />
            <span className={`absolute right-0.5 ${top} flex items-center bg-active-gray border-border-gray`}>
                <span onClick={toggleSecretVisibility} className="rounded px-2 py-1 text-sm text-gray-600 cursor-pointer">
                    {isSecretVisible ? <EyeSlashIcon className="w-4 h-4 ml-1" /> : <EyeIcon className="w-4 h-4 ml-1" />}
                </span>
                {copy && <CopyButton text={props.value?.toString() || ''} dark />}
                {refresh && <ArrowPathIcon className="flex h-4 w-4 mr-2 ml-2 cursor-pointer text-gray-500" onClick={refresh} />}
            </span>
        </div>
    );
});

export default SecretInput;
