import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { Badge } from '@/components/ui/Badge';

import type { InputProps } from '@nangohq/design-system';

export const NangoProvidedInput: React.FC<InputProps & { fakeValueSize?: number }> = ({ fakeValueSize = 12, ...props }) => {
    return (
        <InputGroup>
            <InputGroupInput disabled value={'•'.repeat(fakeValueSize)} {...props} />
            <InputGroupAddon align="inline-end">
                <Badge variant="gray" className="uppercase">
                    Nango provided
                </Badge>
            </InputGroupAddon>
        </InputGroup>
    );
};
