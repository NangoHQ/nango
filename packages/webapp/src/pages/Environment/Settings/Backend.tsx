import { ArrowUpRight, Info } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertActions, AlertButton, AlertDescription, InlineCode } from '@nangohq/design-system';

import { DocsIconLink } from '@/components/patterns/DocsIconLink';
import { EditableInput } from '@/components/patterns/EditableInput';
import { usePermissions } from '@/hooks/usePermissions';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { SettingsCard } from './components/SettingsCard';
import { apiErrorMessage } from './utils';

const CALLBACK_DOCS_URL = 'https://nango.dev/docs/guides/auth/setup#custom-oauth-callback-url-optional';

export const BackendSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);

    const { can } = usePermissions();
    const canEditEnvironment = can('environment:settings:update');

    const [isEditing, setIsEditing] = useState(false);

    if (!environmentAndAccount) {
        return null;
    }

    const saveCallbackUrl = async (value: string) => {
        try {
            await patchEnvironmentAsync({ callback_url: value });
            toast({ title: 'Callback URL updated', variant: 'success' });
        } catch (err) {
            toast({ title: apiErrorMessage(err, 'Failed to update callback URL'), variant: 'error' });
            throw err;
        }
    };

    return (
        <SettingsCard
            title={
                <span className="inline-flex items-center gap-1.5">
                    Callback URL
                    <DocsIconLink href={CALLBACK_DOCS_URL} label="Callback URL documentation" />
                </span>
            }
        >
            <EditableInput
                id="callback_url"
                mono
                initialValue={environmentAndAccount.environment.callback_url}
                onEditingChange={setIsEditing}
                onSave={saveCallbackUrl}
                canEdit={canEditEnvironment}
            />
            {isEditing && (
                <Alert variant="info">
                    <Info />
                    <AlertDescription>
                        <span>
                            Changing the callback URL requires an active <InlineCode>308</InlineCode> redirect and updating the registered callback URL with all
                            OAuth API providers. Otherwise authorization attempts will fail.
                        </span>
                    </AlertDescription>
                    <AlertActions>
                        <AlertButton asChild>
                            <a href={CALLBACK_DOCS_URL} target="_blank" rel="noopener noreferrer">
                                View docs
                                <ArrowUpRight />
                            </a>
                        </AlertButton>
                    </AlertActions>
                </Alert>
            )}
        </SettingsCard>
    );
};
