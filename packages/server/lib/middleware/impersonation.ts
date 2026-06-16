import type { Role } from '@nangohq/types';

// Impersonation sessions (debugMode) run as `override` when configured, capping their privileges
// regardless of the impersonated user's real role. `forced` signals that RBAC must be enforced for
// the request even when the account's plan would normally bypass it, so the cap can't be dodged by
// impersonating an account without RBAC enabled.
export function resolveImpersonationRole({ role, debugMode, override }: { role: Role; debugMode: boolean | undefined; override: Role | undefined }): {
    role: Role;
    forced: boolean;
} {
    if (debugMode === true && override) {
        return { role: override, forced: true };
    }
    return { role, forced: false };
}
