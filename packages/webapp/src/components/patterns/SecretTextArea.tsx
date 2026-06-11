import { EyeIcon, EyeOff } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '../ui/Button';
import { CopyButton } from '../ui/CopyButton';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from '../ui/InputGroup';
import { PermissionGate } from '@/components/patterns/PermissionGate';

interface SecretTextAreaProps extends Omit<React.ComponentProps<'textarea'>, 'onChange'> {
    copy?: boolean;
    canRead?: boolean;
    onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
}

export const SecretTextArea: React.FC<SecretTextAreaProps> = ({ copy, canRead = true, value, defaultValue, onChange, ...props }) => {
    const [isSecretVisible, setIsSecretVisible] = useState(false);
    // Track edits in uncontrolled mode so copy always reflects the current value.
    const [uncontrolledValue, setUncontrolledValue] = useState(() => defaultValue?.toString() ?? '');

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible((prev) => !prev), []);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            if (value === undefined) setUncontrolledValue(e.target.value);
            onChange?.(e);
        },
        [value, onChange]
    );

    const textToCopy = value !== undefined ? value.toString() : uncontrolledValue;

    return (
        <InputGroup>
            {isSecretVisible ? (
                <InputGroupTextarea
                    {...props}
                    value={canRead ? value : '•'.repeat(32)}
                    defaultValue={canRead ? defaultValue : undefined}
                    onChange={canRead ? handleChange : undefined}
                />
            ) : (
                <InputGroupInput
                    {...(props as React.ComponentProps<'input'>)}
                    value={canRead ? (value as string) : '•'.repeat(32)}
                    defaultValue={canRead ? (defaultValue as string) : undefined}
                    type="password"
                    onChange={canRead ? (handleChange as unknown as React.ChangeEventHandler<HTMLInputElement>) : undefined}
                />
            )}
            <InputGroupAddon align="inline-end" className={isSecretVisible ? 'self-start' : ''}>
                <PermissionGate condition={canRead}>
                    {(allowed) => (
                        <Button disabled={!allowed} type="button" variant="ghost" size="icon" onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeIcon /> : <EyeOff />}
                        </Button>
                    )}
                </PermissionGate>
                {copy && <PermissionGate condition={canRead}>{(allowed) => <CopyButton text={textToCopy} disabled={!allowed} />}</PermissionGate>}
            </InputGroupAddon>
        </InputGroup>
    );
};
