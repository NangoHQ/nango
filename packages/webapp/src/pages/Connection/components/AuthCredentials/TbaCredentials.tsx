import { SecretInput } from '@/components-v2/SecretInput';
import { Label } from '@/components-v2/ui/label';

import type { TbaCredentials } from '@nangohq/types';

export const TbaCredentialsComponent: React.FC<{
    credentials: TbaCredentials;
}> = ({ credentials }) => {
    return (
        <>
            <div className="flex flex-col gap-2">
                <Label htmlFor="token_id">Token ID</Label>
                <SecretInput id="token_id" value={credentials.token_id} disabled copy />
            </div>

            <div className="flex flex-col gap-2">
                <Label htmlFor="token_secret">Token secret</Label>
                <SecretInput id="token_secret" value={credentials.token_secret} disabled copy />
            </div>

            {credentials.config_override && (
                <>
                    {credentials.config_override.client_id && (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client_id_override">Client ID override</Label>
                            <SecretInput id="client_id_override" value={credentials.config_override.client_id} disabled copy />
                        </div>
                    )}

                    {credentials.config_override.client_secret && (
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="client_secret_override">Client secret override</Label>
                            <SecretInput id="client_secret_override" value={credentials.config_override.client_secret} disabled copy />
                        </div>
                    )}
                </>
            )}
        </>
    );
};
