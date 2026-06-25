import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { Badge } from '@/components/ui/Badge';

export const NangoProvidedInput: React.FC<React.ComponentProps<'input'> & { fakeValueSize?: number }> = ({ fakeValueSize = 12, ...props }) => {
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
