import type { InternalNango as Nango } from '../../credentials-verification-script.js';

// impact.com scopes every path to the account type (Brand: /Advertisers, Partner: /Mediapartners, Agency: /Agencies)
// and to the Account SID, which is also the Basic auth username. The account type is not known upfront, so each
// account type's company information endpoint is tried in turn. A scoped token whose scopes do not cover the
// endpoint gets 403, so 403 is accepted as valid; the key is only rejected when every account type answers 401.
const accountTypes = ['Advertisers', 'Mediapartners', 'Agencies'];

export default async function execute(nango: Nango) {
    const { provider_config_key, credentials } = nango.getConnection();
    const accountSid = 'username' in credentials && typeof credentials.username === 'string' ? credentials.username : '';
    if (!accountSid) {
        throw new Error('Invalid credentials');
    }

    let notFoundError: Error | undefined = undefined;

    for (const accountType of accountTypes) {
        // GET /Advertisers/{AccountSID}/CompanyInformation (Brand)
        // https://integrations.impact.com/brand-api-reference/reference/accounts/company-information
        // GET /Mediapartners/{AccountSID}/CompanyInformation (Partner)
        // https://integrations.impact.com/partner-api-reference/partner-v15/reference/accounts/accounts
        // GET /Agencies/{AccountSID}/CompanyInformation (Agency)
        // https://integrations.impact.com/agency-v3/reference/account/company-information
        // 401 for missing or incorrect credentials:
        // https://integrations.impact.com/brand-api-reference/readme/authentication
        // 403 for a scoped token whose scopes do not include the endpoint:
        // https://integrations.impact.com/brand-api-reference/readme/status-codes-and-errors
        // Other errors (rate limits, outages, network errors) are rethrown as they are.
        try {
            await nango.proxy({
                method: 'GET',
                endpoint: `/${accountType}/${encodeURIComponent(accountSid)}/CompanyInformation`,
                providerConfigKey: provider_config_key
            });
            return;
        } catch (err) {
            const status = errorStatus(err);
            if (status === 403) {
                return;
            }
            if (status === 401) {
                continue;
            }
            // The docs do not say what a valid token gets on another account type's path, so a 404 moves on to the next one
            if (status === 404 && err instanceof Error) {
                notFoundError ??= err;
                continue;
            }
            throw err;
        }
    }

    if (notFoundError) {
        throw notFoundError;
    }
    throw new Error('Invalid credentials');
}

// The status decides, so the body (JSON or text) is not parsed
function errorStatus(err: unknown): number | undefined {
    if (typeof err !== 'object' || err === null || !('response' in err) || typeof err.response !== 'object' || err.response === null) {
        return undefined;
    }
    const response = err.response;
    return 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}
