import { forwardRef, useCallback, useState } from 'react';
import { EyeIcon, EyeSlashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import classNames from 'classnames';
import { CopyButton } from '../button/CopyButton';
import { Input } from './Input';
import Button from '../button/Button';

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

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible, setIsSecretVisible]);

    return (
        <div className={`relative flex grow ${props.additionalclass ?? ''}`}>
            <Input
                type={isSecretVisible ? 'text' : 'password'}
                ref={ref}
                variant={'flat'}
                className={classNames(className)}
                value={value || ''}
                onChange={(e) => updateValue(e.currentTarget.value)}
                {...props}
                after={
                    <div className={`flex items-center gap-2`}>
                        <Button variant="icon" size={'xs'} onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </Button>
                        {copy && <CopyButton text={(props.value || optionalvalue || defaultValue)?.toString() || ''} />}
                        {refresh && <ArrowPathIcon className="flex h-4 w-4 cursor-pointer text-gray-500" onClick={refresh} />}
                    </div>
                }
            />
        </div>
    );
});

export default SecretInput;
