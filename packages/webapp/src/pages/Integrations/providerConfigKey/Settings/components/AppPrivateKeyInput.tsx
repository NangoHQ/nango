import { InfoTooltip } from './InfoTooltip';
import { EditableInput } from '@/components-v2/EditableInput';
import { Label } from '@/components-v2/ui/label';

interface AppPrivateKeyInputProps {
    initialValue: string;
    onSave: (value: string) => Promise<void>;
}

export const AppPrivateKeyInput: React.FC<AppPrivateKeyInputProps> = ({ initialValue, onSave }) => {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center">
                <Label htmlFor="private_key">App Private Key</Label>
                <InfoTooltip>
                    Obtain the app private key from the app page by downloading the private key and pasting the entirety of its contents here.
                </InfoTooltip>
            </div>
            <EditableInput
                secret
                textArea
                initialValue={initialValue}
                hintText='Private key must start with "-----BEGIN RSA PRIVATE KEY----" and end with "-----END RSA PRIVATE KEY-----"'
                validate={(value) => {
                    if (!value.trim().startsWith('-----BEGIN RSA PRIVATE KEY----') || !value.trim().endsWith('-----END RSA PRIVATE KEY-----')) {
                        return 'Private key must start with "-----BEGIN RSA PRIVATE KEY----" and end with "-----END RSA PRIVATE KEY-----"';
                    }
                    return null;
                }}
                onSave={onSave}
            />
        </div>
    );
};
