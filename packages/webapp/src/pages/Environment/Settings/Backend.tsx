import { IconExternalLink } from '@tabler/icons-react';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { permissions } from '@nangohq/authz';

import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { useEnvironment, usePatchEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { EditableInput } from '@/components-v2/EditableInput';
import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { usePermissions } from '@/hooks/usePermissions';
import { APIError } from '@/utils/api';

export const BackendSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);

    const isProdEnv = environmentAndAccount?.environment.is_production || false;

    const { can } = usePermissions();
    const canEditEnv = can(permissions.canWriteProdEnvironment) || !isProdEnv;

    const [isEditingCallbackUrl, setIsEditingCallbackUrl] = useState(false);

    if (!environmentAndAccount) {
        return null;
    }

    return (
        <SettingsContent title="Backend">
            <SettingsGroup
                label={
                    <>
                        <div className="flex gap-1.5">
                            Callback URL
                            <Link
                                className="flex gap-2 items-center"
                                target="_blank"
                                to="https://nango.dev/docs/implementation-guides/platform/auth/configure-integration#2-create-an-integration"
                            >
                                <IconExternalLink stroke={1} size={18} />
                            </Link>
                        </div>
                    </>
                }
            >
                <div className="flex flex-col gap-2">
                    <EditableInput
                        id="callback_url"
                        placeholder="https://api.nango.dev/oauth/callback"
                        initialValue={environmentAndAccount.environment.callback_url}
                        onEditingChange={setIsEditingCallbackUrl}
                        onSave={async (value) => {
                            try {
                                await patchEnvironmentAsync({ callback_url: value });
                                toast({ title: 'Successfully updated', variant: 'success' });
                            } catch (err) {
                                if (err instanceof APIError) {
                                    toast({ title: err.json.error?.message ?? 'Failed to update', variant: 'error' });
                                } else {
                                    toast({ title: 'Failed to update', variant: 'error' });
                                }
                                // Throw for EditableInput
                                throw err;
                            }
                        }}
                        canEdit={canEditEnv}
                    />
                    {isEditingCallbackUrl && (
                        <Alert variant="info">
                            <Info />
                            <AlertDescription>
                                <span>
                                    Changing the callback URL requires an active 308 redirect and updating the registered callback URL with all OAuth API
                                    providers. Otherwise authorization attempts will fail. Details in{' '}
                                    <StyledLink
                                        to="https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth#5-setup-a-custom-oauth-callback-url-optional"
                                        type="external"
                                        variant="info"
                                    >
                                        docs
                                    </StyledLink>
                                    .
                                </span>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </SettingsGroup>
        </SettingsContent>
    );
};
