import { forwardRef, useCallback, useState } from 'react';
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
                    'border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none',
                    className
                )}
                value={value}
                onChange={(e) => updateValue(e.currentTarget.value)}
                {...props}
            />
            <span className="absolute right-1 top-2 flex items-center bg-gray-900">
                <span onClick={toggleSecretVisibility} className="bg-gray-300 hover:bg-gray-400 rounded px-2 py-1 text-sm text-gray-600 cursor-pointer">
                    {isSecretVisible ? 'hide' : 'show'}
                </span>
                {copy && <CopyButton text={value as string} />}
            </span>
        </div>
    );
});

export default SecretInput;
