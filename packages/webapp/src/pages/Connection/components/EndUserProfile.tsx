import type { ApiEndUser } from '@nangohq/types';

export const EndUserProfile: React.FC<{ endUser: ApiEndUser; connectionId: string }> = ({ endUser, connectionId }) => {
    return (
        <div className="flex flex-col overflow-hidden">
            <div className="text-white break-words break-all truncate">{endUser.email ?? endUser.displayName ?? connectionId}</div>

            <div className="text-dark-500 text-xs font-code flex gap-2">
                {endUser.email && endUser.displayName && <span>{endUser.displayName}</span>}
                {!endUser.email && endUser.displayName && <span>{connectionId}</span>}
                {endUser.organization?.displayName && <span>({endUser.organization?.displayName})</span>}
            </div>
        </div>
    );
};
