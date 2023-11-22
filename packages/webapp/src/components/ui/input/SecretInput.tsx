import { forwardRef, useCallback, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import CopyButton from '../button/CopyButton';

type SecretInputProps = Omit<JSX.IntrinsicElements['input'], 'defaultValue'> & { copy?: boolean; defaultValue?: string, optionalvalue?: string; setoptionalvalue?: (value: string) => void; additionalclass?: string; };

const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function PasswordField({ className, copy, ...props }, ref) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const [changedValue, setChangedValue] = useState(props.defaultValue);

    const value = props.optionalvalue === null ? '' : props.optionalvalue || changedValue;
    const updateValue = props.setoptionalvalue || setChangedValue;

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible, setIsSecretVisible]);

    return (
        <div className={`relative flex ${props.additionalclass ?? ''}`}>
            <input
                type={isSecretVisible ? 'text' : 'password'}
                ref={ref}
                className={classNames(
                    'border-border-gray bg-zinc-900 text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-0.5 text-sm placeholder-gray-400 shadow-sm focus:outline-none',
                    className
                )}
                value={value}
                onChange={(e) => updateValue(e.currentTarget.value)}
                {...props}
            />
            <span className="absolute right-0.5 top-0.5 flex items-center">
                <span onClick={toggleSecretVisibility} className="rounded px-2 py-1 text-sm text-gray-600 cursor-pointer">
                    {isSecretVisible ? <EyeSlashIcon className="w-4 h-4 ml-1" /> : <EyeIcon className="w-4 h-4 ml-1" />}
                </span>
                {copy && <CopyButton text={value as string} dark />}
            </span>
        </div>
    );
});

export default SecretInput;
