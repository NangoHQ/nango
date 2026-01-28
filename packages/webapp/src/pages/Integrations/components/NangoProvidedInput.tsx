import { Badge } from '@/components-v2/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';

export const NangoProvidedInput: React.FC<React.ComponentProps<'input'> & { fakeValueSize?: number }> = ({ fakeValueSize = 12, ...props }) => {
    return (
        <InputGroup>
            <InputGroupInput disabled value={'•'.repeat(fakeValueSize)} {...props} />
            <InputGroupAddon align="inline-end">
                <Badge variant="gray">Nango provided</Badge>
            </InputGroupAddon>
        </InputGroup>
    );
};
