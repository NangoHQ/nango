import { EyeSlashIcon } from '@heroicons/react/24/outline';
import { EyeIcon } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from './ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';

export const SecretInput: React.FC<React.ComponentProps<'input'>> = (props) => {
    const [isSecretVisible, setIsSecretVisible] = useState(false);

    const toggleSecretVisibility = useCallback(() => setIsSecretVisible(!isSecretVisible), [isSecretVisible]);

    return (
        <InputGroup>
            <InputGroupInput {...props} type={isSecretVisible ? 'text' : 'password'} />
            <InputGroupAddon align="inline-end">
                <Button variant="ghost" size="icon" onClick={toggleSecretVisibility}>
                    {isSecretVisible ? <EyeIcon /> : <EyeSlashIcon />}
                </Button>
            </InputGroupAddon>
        </InputGroup>
    );
};
