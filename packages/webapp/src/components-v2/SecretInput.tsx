import { EyeSlashIcon } from '@heroicons/react/24/outline';
import { EyeIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { CopyButton } from './CopyButton';
import { PermissionGate } from './PermissionGate';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';

interface SecretInputProps extends React.ComponentProps<'input'> {
    copy?: boolean;
    canRead?: boolean;
}

export const SecretInput: React.FC<SecretInputProps> = ({ copy, canRead = true, value, defaultValue, ...props }) => {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    const textToCopy = (value || defaultValue)?.toString() || '';

    const displayValue = !canRead ? '•'.repeat(32) : (value ?? defaultValue ?? '');

    return (
        <InputGroup>
            <InputGroupInput {...props} value={displayValue} defaultValue={canRead ? defaultValue : undefined} type={isSecretVisible ? 'text' : 'password'} />
            <InputGroupAddon align="inline-end">
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
