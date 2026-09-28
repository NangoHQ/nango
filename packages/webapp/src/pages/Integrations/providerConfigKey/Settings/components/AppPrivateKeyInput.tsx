import { EditableInput } from '@/components/patterns/EditableInput';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { SettingsField } from './SettingsLayout';

interface AppPrivateKeyInputProps {
    initialValue: string;
    onSave: (value: string) => Promise<void>;
}

export const AppPrivateKeyInput: React.FC<AppPrivateKeyInputProps> = ({ initialValue, onSave }) => {
    return (
        <SettingsField
            label="App private key"
            htmlFor="private_key"
            info={
                <InfoTooltip size="sm">
                    Obtain the app private key from the app page by downloading the private key and pasting the entirety of its contents here.
                </InfoTooltip>
            }
        >
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
        </SettingsField>
    );
};
