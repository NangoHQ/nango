import { ArrowPathIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { forwardRef, useState } from 'react';

import { Input } from './Input';
import { cn } from '../../../utils/utils';
import { Button } from '../button/Button';
import { CopyButton } from '../button/CopyButton';

import type { InputStyleProp, InputVariantProp } from './Input';

type SecretInputProps = Omit<JSX.IntrinsicElements['input'], 'defaultValue'> & {
    copy?: boolean;
    view?: boolean;
    defaultValue?: string;
    optionalValue?: string | null;
    setOptionalValue?: (value: string) => void;
    additionalClass?: string;
    tall?: boolean;
    refreshing?: boolean;
    refresh?: () => void;
    variant?: InputVariantProp['variant'];
    inputSize?: InputStyleProp['inputSize'];
};

const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function PasswordField(
    { className, copy, view = true, optionalValue, setOptionalValue, defaultValue, refreshing, refresh, variant, inputSize, ...props },
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
                variant={variant || 'flat'}
                inputSize={inputSize}
                className={cn(className)}
                value={value || ''}
                onChange={(e) => updateValue(e.currentTarget.value)}
                disabled={refreshing === true}
                {...props}
                after={
                    <div className={cn(`flex items-center gap-1 `, !variant && 'bg-active-gray')}>
                        {view && (
                            <Button variant="icon" size={'xs'} onClick={toggleSecretVisibility}>
                                {isSecretVisible ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                            </Button>
                        )}
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
