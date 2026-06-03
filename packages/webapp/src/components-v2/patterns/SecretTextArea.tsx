import { EyeSlashIcon } from '@heroicons/react/24/outline';
import { EyeIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '../ui/Button';
import { CopyButton } from '../ui/CopyButton';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from '../ui/InputGroup';
import { PermissionGate } from '@/components-v2/patterns/PermissionGate';

interface SecretTextAreaProps extends Omit<React.ComponentProps<'textarea'>, 'onChange'> {
    copy?: boolean;
    canRead?: boolean;
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}

export const SecretTextArea: React.FC<SecretTextAreaProps> = ({ copy, canRead = true, value, defaultValue, onChange, ...props }) => {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible((prev) => !prev), []);

    const textToCopy = (value || defaultValue)?.toString() || '';
    const displayValue = !canRead ? '•'.repeat(32) : (value ?? defaultValue ?? '');

    return (
        <InputGroup>
            {isSecretVisible ? (
                <InputGroupTextarea
                    {...props}
                    value={canRead ? value : '•'.repeat(32)}
                    defaultValue={canRead ? defaultValue : undefined}
                    onChange={canRead ? onChange : undefined}
                />
            ) : (
                <InputGroupInput
                    {...(props as React.ComponentProps<'input'>)}
                    value={displayValue as string}
                    defaultValue={canRead ? (defaultValue as string) : undefined}
                    type="password"
                    onChange={canRead ? (onChange as unknown as React.ChangeEventHandler<HTMLInputElement>) : undefined}
                />
            )}
            <InputGroupAddon align="inline-end" className={isSecretVisible ? 'self-start' : ''}>
                <PermissionGate condition={canRead}>
                    {(allowed) => (
                        <Button disabled={!allowed} type="button" variant="ghost" size="icon" onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeIcon /> : <EyeSlashIcon />}
                        </Button>
                    )}
                </PermissionGate>
                {copy && <PermissionGate condition={canRead}>{(allowed) => <CopyButton text={textToCopy} disabled={!allowed} />}</PermissionGate>}
            </InputGroupAddon>
        </InputGroup>
    );
};
