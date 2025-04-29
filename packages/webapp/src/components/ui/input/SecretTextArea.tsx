import { EyeNoneIcon, EyeOpenIcon } from '@radix-ui/react-icons';
import { forwardRef, useCallback, useState } from 'react';

import { Input } from './Input';
import { cn } from '../../../utils/utils';
import { Button } from '../button/Button';
import { CopyButton } from '../button/CopyButton';

import type { TextareaHTMLAttributes } from 'react';

interface SecretTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    copy?: boolean;
    onUpdate: (value: string) => void;
}

export const SecretTextArea = forwardRef<HTMLTextAreaElement, SecretTextareaProps>(function SecretTextArea({ className, copy, value, onUpdate, ...rest }, ref) {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    return (
        <div className={cn('relative flex w-full')}>
            {isSecretVisible ? (
                <textarea
                    ref={ref}
                    className={cn(
                        'bg-active-gray border-dark-800  text-text-light-gray w-full appearance-none rounded-md px-3 py-2 text-base placeholder-gray-400 shadow-sm ',
                        className,
                        'h-48'
                    )}
                    value={value}
                    onChange={(e) => onUpdate(e.currentTarget.value)}
                    {...rest}
                />
            ) : (
                <Input
                    type="password"
                    variant={'flat'}
                    value={value}
                    // @ts-expect-error we are mixing input and textarea props
                    onChange={(e) => onUpdate(e.currentTarget.value)}
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
