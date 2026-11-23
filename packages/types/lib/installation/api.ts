import type { ApiEndpoint, ApiError } from '../api.js';
import type { License } from '../license.js';

export type InstallationLicense =
    | { status: 'missing' }
    | { status: 'invalid'; reason: string }
    | { status: 'valid' | 'expired' | 'grace_ended'; license: License };

export type GetInstallation = ApiEndpoint<{
    Audit: { kind: 'no-audit'; reason: 'non-auditable' };
    Method: 'GET';
    Path: '/api/v1/installation';
    /** The build has no license public key compiled in, so it is not a managed release */
    Error: ApiError<'no_license_public_key'>;
    Success: {
        data: {
            version: string;
            /** Stamped by the managed release workflow, so null on a community image */
            managedVersion: string | null;
            commit: string | null;
            license: InstallationLicense;
        };
    };
}>;
