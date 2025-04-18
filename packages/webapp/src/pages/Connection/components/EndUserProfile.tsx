import type { ApiEndUser } from '@nangohq/types';

export const EndUserProfile: React.FC<{ endUser: ApiEndUser; connectionId: string }> = ({ endUser, connectionId }) => {
    return (
        <div className="flex flex-col overflow-hidden">
            <div className="text-white break-words break-all truncate">{endUser.email ?? endUser.display_name ?? connectionId}</div>

            <div className="text-dark-500 text-xs font-code flex gap-2">
                {endUser.email && endUser.display_name && <span>{endUser.display_name}</span>}
                {!endUser.email && endUser.display_name && <span>{connectionId}</span>}
                {endUser.organization?.display_name && <span>({endUser.organization?.display_name})</span>}
            </div>
        </div>
    );
};
