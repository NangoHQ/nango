import { EyeIcon, EyeOff } from 'lucide-react';
import { useCallback, useState } from 'react';

import { IconButton } from '@nangohq/design-system';

import { CopyButton } from '../ui/CopyButton';
import { InputGroup, InputGroupAddon, InputGroupInput } from '../ui/InputGroup';
import { PermissionGate } from '@/components/patterns/PermissionGate';

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
                        <IconButton disabled={!allowed} type="button" variant="ghost" size="2xs" label="Toggle visibility" onClick={toggleSecretVisibility}>
                            {isSecretVisible ? <EyeIcon /> : <EyeOff />}
                        </IconButton>
                    )}
                </PermissionGate>
                {copy && <PermissionGate condition={canRead}>{(allowed) => <CopyButton text={textToCopy} disabled={!allowed} />}</PermissionGate>}
            </InputGroupAddon>
        </InputGroup>
    );
};
