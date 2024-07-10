import type { ChangeEvent, TextareaHTMLAttributes } from 'react';
import { forwardRef, useCallback, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { CopyButton } from '../button/CopyButton';

interface SecretTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    copy?: boolean;
    optionalvalue?: string;
    setoptionalvalue?: (value: string) => void;
    additionalclass?: string;
}

const SecretTextarea = forwardRef<HTMLTextAreaElement, SecretTextareaProps>(function SecretTextarea(
    { className, copy, optionalvalue, setoptionalvalue, additionalclass, defaultValue, ...rest },
    ref
) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);
    const [changedValue, setChangedValue] = useState(defaultValue);

    const value = optionalvalue || changedValue;
    const updateValue = setoptionalvalue || setChangedValue;

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        updateValue(e.currentTarget.value);
    };

    return (
        <div className={`relative flex ${additionalclass ?? ''}`}>
            {isSecretVisible ? (
                <textarea
                    ref={ref}
                    className={classNames(
                        'border-border-gray bg-bg-black text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-400 shadow-sm focus:outline-none',
                        className,
                        'h-48'
                    )}
                    value={value}
                    onChange={handleTextareaChange}
                    {...rest}
                />
            ) : (
                <input
                    type="password"
                    value={value}
                    // @ts-expect-error we are mixing input and textarea props
                    onChange={(e) => updateValue(e.currentTarget.value)}
                    autoComplete="new-password"
                    className={classNames(
                        'border-border-gray bg-active-gray text-text-light-gray focus:border-white focus:ring-white block w-full appearance-none rounded-md border px-3 py-0.6 text-sm placeholder-gray-400 shadow-sm focus:outline-none',
                        className
                    )}
                    {...rest}
                />
            )}
            <span className="absolute right-1 top-1.5 flex items-center bg-active-gray border-border-gray">
                <span onClick={toggleSecretVisibility} className="rounded px-2 py-1 text-sm text-gray-600 cursor-pointer">
                    {isSecretVisible ? <EyeSlashIcon className="w-4 h-4 ml-1" /> : <EyeIcon className="w-4 h-4 ml-1" />}
                </span>
                {copy && <CopyButton text={value as string} />}
            </span>
        </div>
    );
});

export default SecretTextarea;
