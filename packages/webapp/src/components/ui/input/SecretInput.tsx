import { forwardRef, useState } from 'react';
import { EyeIcon, EyeSlashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { CopyButton } from '../button/CopyButton';
import { Input } from './Input';
import { Button } from '../button/Button';
import { cn } from '../../../utils/utils';

type SecretInputProps = Omit<JSX.IntrinsicElements['input'], 'defaultValue'> & {
    copy?: boolean;
    defaultValue?: string;
    optionalValue?: string | null;
    setOptionalValue?: (value: string) => void;
    additionalClass?: string;
    tall?: boolean;
    refreshing?: boolean;
    refresh?: () => void;
};

const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function PasswordField(
    { className, copy, optionalValue, setOptionalValue, defaultValue, refreshing, refresh, ...props },
    ref
) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const [changedValue, setChangedValue] = useState(defaultValue);

    const value = optionalValue === null ? '' : optionalValue || changedValue;
    const updateValue = setOptionalValue || setChangedValue;

    const toggleSecretVisibility: React.MouseEventHandler<HTMLButtonElement> = (e) => {
        e.preventDefault();
        setIsSecretVisible(!isSecretVisible);
    };

    return (
        <div className={`relative flex grow ${props.additionalClass ?? ''}`}>
            <Input
                type={isSecretVisible ? 'text' : 'password'}
                ref={ref}
                variant={'flat'}
                className={cn(className)}
                value={value || ''}
                onChange={(e) => updateValue(e.currentTarget.value)}
                disabled={refreshing === true}
                {...props}
                after={
                    <div className={`flex items-center gap-1 bg-active-gray`}>
                        <Button variant="icon" size={'xs'} onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                        </Button>
                        {copy && <CopyButton text={(props.value || optionalValue || defaultValue)?.toString() || ''} />}
                        {refresh && (
                            <Button variant={'icon'} size="xs" isLoading={refreshing === true} onClick={refresh}>
                                <ArrowPathIcon className="flex h-4 w-4 cursor-pointer text-gray-500" />
                            </Button>
                        )}
                    </div>
                }
            />
        </div>
    );
});

export default SecretInput;
