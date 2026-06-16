import type { Role } from '@nangohq/types';

// Impersonation sessions (debugMode) run as `override` when configured, capping their privileges
// regardless of the impersonated user's real role. Falls back to the real role otherwise.
export function resolveImpersonationRole({ role, debugMode, override }: { role: Role; debugMode: boolean | undefined; override: Role | undefined }): Role {
    if (debugMode === true && override) {
        return override;
    }
    return role;
}
