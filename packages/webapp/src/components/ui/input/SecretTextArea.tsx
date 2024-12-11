import type { ChangeEvent, TextareaHTMLAttributes } from 'react';
import { forwardRef, useCallback, useState } from 'react';
import { CopyButton } from '../button/CopyButton';
import { cn } from '../../../utils/utils';
import { EyeNoneIcon, EyeOpenIcon } from '@radix-ui/react-icons';
import { Button } from '../button/Button';
import { Input } from './Input';

interface SecretTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    copy?: boolean;
    optionalValue?: string;
    setOptionalValue?: (value: string) => void;
    additionalClass?: string;
}

const SecretTextarea = forwardRef<HTMLTextAreaElement, SecretTextareaProps>(function SecretTextarea(
    { className, copy, optionalValue, setOptionalValue, additionalClass, defaultValue, ...rest },
    ref
) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);
    const [changedValue, setChangedValue] = useState(defaultValue);

    const value = optionalValue || changedValue;
    const updateValue = setOptionalValue || setChangedValue;

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        updateValue(e.currentTarget.value);
    };

    return (
        <div className={cn('relative flex', additionalClass)}>
            {isSecretVisible ? (
                <textarea
                    ref={ref}
                    className={cn(
                        'bg-active-gray border-dark-800  text-text-light-gray w-full appearance-none rounded-md px-3 py-2 text-base placeholder-gray-400 shadow-sm ',
                        className,
                        'h-48'
                    )}
                    value={value}
                    onChange={handleTextareaChange}
                    {...rest}
                />
            ) : (
                <Input
                    type="password"
                    variant={'flat'}
                    value={value}
                    // @ts-expect-error we are mixing input and textarea props
                    onChange={(e) => updateValue(e.currentTarget.value)}
                    {...rest}
                />
            )}
            <div className="absolute right-1 top-1 flex items-center bg-active-gray">
                <Button variant={'icon'} size={'xs'} onClick={toggleSecretVisibility} className="rounded px-2 py-1 text-sm text-gray-600 cursor-pointer">
                    {isSecretVisible ? <EyeNoneIcon /> : <EyeOpenIcon />}
                </Button>
                {copy && <CopyButton text={value as string} />}
            </div>
        </div>
    );
});

export default SecretTextarea;
