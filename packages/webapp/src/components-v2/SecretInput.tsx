import { EyeSlashIcon } from '@heroicons/react/24/outline';
import { EyeIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { CopyButton } from './CopyButton';
import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';

interface SecretInputProps extends React.ComponentProps<'input'> {
    copy?: boolean;
}

export const SecretInput: React.FC<SecretInputProps> = ({ copy, value, defaultValue, ...props }) => {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    const textToCopy = (value || defaultValue)?.toString() || '';

    return (
        <InputGroup>
            <InputGroupInput {...props} value={value} defaultValue={defaultValue} type={isSecretVisible ? 'text' : 'password'} />
            <InputGroupAddon align="inline-end">
                <Button type="button" variant="ghost" size="icon" onClick={toggleSecretVisibility}>
                    {isSecretVisible ? <EyeIcon /> : <EyeSlashIcon />}
                </Button>
                {copy && <CopyButton text={textToCopy} />}
            </InputGroupAddon>
        </InputGroup>
    );
};
