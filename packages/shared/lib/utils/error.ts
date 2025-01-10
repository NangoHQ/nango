import { stringifyError } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';

export class NangoError extends Error {
    public readonly status: number = 500;
    public readonly type: string;
    public payload: Record<string, unknown>;
    public additional_properties?: Record<string, JsonValue> | undefined = undefined;
    public override readonly message: string;

    constructor(type: string, payload = {}, status?: number, additional_properties?: Record<string, JsonValue>) {
        super();

        this.type = type;
        this.payload = payload;
        this.additional_properties = additional_properties;

        if (status) {
            this.status = status;
        }

        switch (type) {
            case 'missing_auth_header':
                this.status = 401;
                this.message = 'Authentication failed. The request is missing the Authorization header.';
                break;

            case 'malformed_auth_header':
                this.status = 401;
                this.message = 'Authentication failed. The Authorization header is malformed.';
                break;

            case 'unknown_account':
                this.status = 401;
                this.message = 'Authentication failed. The provided authorization header does not match any account.';
                break;

            case 'invalid_secret_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret key is invalid.';
                break;

            case 'invalid_secret_key_format':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret key is not a UUID v4.';
                break;

            case 'invalid_connect_session_token_format':
                this.status = 401;
                this.message = 'Authentication failed. The provided connect session token is not following correct format: nango_connect_session_RANDOM)';
                break;

            case 'missing_public_key':
                this.status = 401;
                this.message = 'Authentication failed. The request is missing a valid public key parameter.';
                break;

            case 'invalid_public_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided public key is not a UUID v4.';
                break;

            case 'unknown_connect_session_token':
                this.status = 401;
                this.message = 'Authentication failed. The provided connect session token does not match any account.';
                break;

            case 'only_nango_cloud':
                this.status = 401;
                this.message = 'This endpoint is only available for Nango Cloud.';
                break;

            case 'invalid_admin_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided admin key is invalid.';
                break;

            case 'admin_key_configuration':
                this.status = 401;
                this.message = 'The admin key is not configured on the server. Contact the API provider.';
                break;

            case 'user_not_found':
                this.status = 401;
                this.message = 'Authentication failed. The user could not be found.';
                break;

            case 'missing_body':
                this.status = 400;
                this.message = 'Missing request body.';
                break;

            case 'invalid_oauth_scopes':
                this.status = 400;
                this.message = 'The requested OAuth scopes are invalid. OAuth scopes should be comma separated and not an array';
                break;

            case 'invalid_invite_token':
                this.status = 400;
                this.message = 'The invite token is invalid.';
                break;

            case 'missing_api_key':
                this.status = 400;
                this.message = `Missing param 'api_key'.`;
                break;

            case 'missing_private_key':
                this.status = 400;
                this.message = `Missing param 'missing_private_key'.`;
                break;

            case 'missing_private_key_id':
                this.status = 400;
                this.message = `Missing param 'private_key_id'.`;
                break;

            case 'missing_issuer_id':
                this.status = 400;
                this.message = `Missing param 'missing_issuer_id'.`;
                break;

            case 'missing_app_id':
                this.status = 400;
                this.message = `Missing param 'app_id'.`;
                break;

            case 'missing_custom':
                this.status = 400;
                this.message = `Missing param 'custom'.`;
                break;

            case 'missing_installation_id':
                this.status = 400;
                this.message = `Missing param 'installation_id'.`;
                break;

            case 'missing_basic_username':
                this.status = 400;
                this.message = `Missing param username for basic api authentication.`;
                break;

            case 'missing_access_token':
                this.status = 400;
                this.message = `Missing param 'access_token'.`;
                break;

            case 'missing_expires_at':
                this.status = 400;
                this.message = `Importing an OAuth2 token requires the 'expires_at' parameter. If the token doesn't expire pass in the 'no_expiration' parameter`;
                break;

            case 'invalid_expires_at':
                this.status = 400;
                this.message = `The provided 'expires_at' parameter is invalid. It should be a valid date`;
                break;

            case 'missing_hmac':
                this.status = 400;
                this.message = `Missing param 'hmac'.`;
                break;

            case 'invalid_hmac':
                this.status = 400;
                this.message = `Invalid HMAC signature.`;
                break;

            case 'missing_provider_config':
                this.status = 400;
                this.message = `Missing param 'provider_config_key'.`;
                break;

            case 'missing_callback_url':
                this.status = 400;
                this.message = `Missing param 'callback_url'.`;
                break;

            case 'missing_token_url':
                this.status = 400;
                this.message = `Token URL is missing or invalid.`;
                break;

            case 'bill_credentials_fetch_error':
                this.status = 400;
                this.message = `Error fetching Bill credentials`;
                break;

            case 'provider_config_creation_failure':
                this.status = 500;
                this.message = `Failed to create the Provider Configuration. Please try again.`;
                break;

            case 'unknown_provider_config':
                this.status = 400;
                this.message = `There is no Provider Configuration matching this key.`;
                if (this.payload) {
                    this.message += ` Please make sure this value exists in the Nango dashboard ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'action_failure':
                this.status = 400;
                this.message = `Failed to perform the action`;
                break;

            case 'webhook_failure':
                this.status = 400;
                this.message = `Failed to perform the webhook`;
                break;

            case 'on_event_failure':
                this.status = 400;
                this.message = `Failed to perform the on-event script`;
                break;

            case 'missing_provider_template':
                this.status = 400;
                this.message = `Missing param 'provider'.`;
                break;

            case 'no_syncs_found':
                this.status = 400;
                this.message = `No syncs found given the inputs.`;
                break;

            case 'missing_client_id':
                this.status = 400;
                this.message = `Missing param 'oauth_client_id'.`;
                break;

            case 'missing_client_secret':
                this.status = 400;
                this.message = `Missing param 'oauth_client_secret'.`;
                break;

            case 'missing_app_secret':
                this.status = 400;
                this.message = `Missing param 'app_secret'.`;
                break;

            case 'missing_connection':
                this.status = 400;
                this.message = `Missing param 'connection_id'.`;
                break;

            case 'missing_connection_id':
                this.status = 400;
                this.message = `Missing param 'connection_id'.`;
                break;

            case 'invalid_limit':
                this.status = 400;
                this.message = 'Invalid limit provided. The limit should be a number.';
                break;

            case 'invalid_timestamp':
                this.status = 400;
                this.message = 'Invalid timestamp provided. The timestamp should be an ISO 8601 string, for example 2023-01-01T00:00:00.000Z.';
                break;

            case 'missing_model':
                this.status = 400;
                this.message = `Missing param 'model'.`;
                break;

            case 'unknown_connection':
                this.status = 404;
                this.message = `No connection matching the provided params of 'connection_id' and 'provider_config_key'.`;
                if (this.payload) {
                    this.message += ` Please make sure these values exist in the Nango dashboard ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'refresh_token_external_error':
                this.status = 400;
                this.message = `The external API returned an error when trying to refresh the access token. Please try again later.`;
                break;

            case 'request_token_external_error':
                this.status = 400;
                this.message = `The external API returned an error when trying to request for an access token. Please try again later.`;
                if (this.payload) {
                    this.message += ` ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'missing_base_api_url':
                this.status = 400;
                this.message =
                    'The proxy is either not supported for this provider or it does not have a default base URL configured (use the baseUrlOverride config param to specify a base URL).';
                break;

            case 'provider_config_edit_not_allowed':
                this.status = 400;
                this.message = 'Provider configuration cannot be edited for API key based authentication.';
                break;

            case 'connection_test_failed':
                this.status = status || 400;
                this.message = `The given credentials were found to be invalid${status ? ` and received a ${status} on a test API call` : ''}. Please check the credentials and try again.`;
                break;

            case 'invalid_auth_mode':
                this.status = 400;
                this.message = 'Invalid auth mode. The provider does not support this auth mode.';
                break;

            case 'wrong_auth_mode':
                this.status = 400;
                this.message = 'The provider does not support making requests. Please use the github-app-oauth provider for the request flow.';
                break;

            case 'unknown_provider_template':
                this.status = 400;
                this.message = `No Provider Template matching the 'provider' parameter.`;
                break;

            case 'duplicate_provider_config':
                this.status = 409;
                this.message = `There is already a Provider Configuration matching the param 'provider_config_key'.`;
                break;

            case 'missing_required_fields_on_deploy':
                this.status = 400;
                this.message = 'Sync name, provider config key, the file, the models, and the runs fields are required to deploy a sync';
                break;

            case 'file_upload_error':
                this.status = 500;
                this.message = 'Error uploading file. Please contact support with the filename and connection details';
                break;

            case 'error_creating_sync_config':
                this.status = 500;
                this.message = 'Error creating sync config from a deploy. Please contact support with the sync name and connection details';
                break;

            case 'generic_error_support':
                this.status = 500;
                this.message = 'An error occurred. Please contact support with this unique id: ' + this.payload;
                break;

            case 'sync_interval_too_short':
                this.status = 400;
                this.message = 'Sync interval is too short. The minimum interval is 30 seconds.';
                break;

            case 'provider_not_on_account':
                this.status = 400;
                this.message = 'This provider is not on your account. Please add the provider to your account first via the integrations tab.';
                break;

            case 'integration_file_not_found':
                this.status = 404;
                this.message = 'The integration file was not found. Please make sure you have recently deployed the integration file(s).';
                break;

            case 'error_creating_zip_file':
                this.status = 500;
                this.message = 'Error creating a zip of the integration file(s). Make sure you have recently deployed the integration file(s).';
                break;

            case 'sync_interval_invalid':
                this.status = 400;
                this.message = 'Sync interval is invalid. The interval should be a time unit.';
                break;

            case 'sync_script_failure':
                this.message = `The sync script failed with an error: ${stringifyError(this.payload)}`;
                break;

            case 'two_step_credentials_fetch_error':
                this.status = 400;
                this.message = `Error fetching Two Step credentials`;
                break;

            case 'signature_token_generation_error':
                this.status = 400;
                this.message = `Error generating signature based token`;
                break;

            case 'unsupported_signature_protocol':
                this.status = 400;
                this.message = `Signature protocol not currently supported`;
                break;

            case 'invalid_two_step_credentials':
                this.status = 400;
                this.message = `Invalid credentials provided to create a Two Step connection`;
                break;

            case 'invalid_app_secret':
                this.status = 400;
                this.message = `Invalid app secret key. Please make sure the app secret is correct.`;
                break;

            case 'invalid_jwt_private_key':
                this.status = 400;
                this.message = `Invalid private key provided for JWT creation.`;
                break;

            case 'invalid_jwt_private_key_id':
                this.status = 400;
                this.message = `Invalid private key Id provided for JWT creation.`;
                break;

            case 'action_script_failure':
                this.message = `The action script failed with an error: ${stringifyError(this.payload)}`;
                break;

            case 'webhook_script_failure':
                this.message = `The webhook script failed with an error: ${stringifyError(this.payload)}`;
                break;

            case 'on_event_script_failure':
                this.message = `The on-event script failed with an error: ${stringifyError(this.payload)}`;
                break;

            case 'pass_through_error':
                this.status = 400;
                this.message = JSON.stringify(this.payload);
                break;

            case 'action_script_runtime_error':
                this.status = 500;
                this.message = 'The action script failed with a runtime error';
                break;

            case 'script_cancelled':
                this.message = 'The script was cancelled';
                break;

            case 'incorrect_param':
                this.status = 400;
                this.message = `The parameter ${this.payload['incorrect'] as string} is invalid. Did you mean ${this.payload['correct'] as string}?`;
                break;

            case 'workos_not_configured':
                this.status = 400;
                this.message = `WorkOS is not configured. Please reach out to support to obtain valid WorkOS credentials.`;
                break;

            case 'account_not_found':
                this.status = 404;
                this.message = `Missing an account name for account login/signup.`;
                break;

            case 'resource_capped':
                this.status = 400;
                // TODO docs link
                this.message =
                    'You have reached the maximum number of integrations with active scripts. Upgrade or deactivate the scripts to create more connections (https://docs.nango.dev/reference/limits).';
                break;

            case 'deploy_missing_json_schema_model':
                this.status = 400;
                this.message = String(this.payload);
                break;

            case 'invalid_action_input':
                this.status = 400;
                this.message = 'Failed to validate the input passed to the action';
                break;

            case 'invalid_action_output':
                this.status = 400;
                this.message = 'Failed to validate the output passed to the action';
                break;

            case 'invalid_sync_record':
                this.status = 400;
                this.message = 'Failed to validate a record in batchSave';
                break;

            case 'script_output_too_big':
                this.status = 400;
                this.message = 'Script output is too big';
                break;

            case 'sync_job_update_failure':
                this.status = 500;
                this.message = `The sync job results could not be updated: ${JSON.stringify(this.payload)}`;
                break;

            case 'script_invalid_error':
                this.status = 500;
                this.message = `An invalid error of type: ${typeof this.payload}`;
                break;

            case 'script_network_error':
                this.status = 500;
                this.message = 'A network error occurred during an HTTP call';
                break;

            case 'script_http_error':
                this.status = 424;
                this.message = `An error occurred during an HTTP call`;
                break;

            case 'script_internal_error':
                this.status = 500;
                this.message = `An internal error occurred during the script execution`;
                break;

            case 'wsse_token_generation_error':
                this.status = 500;
                this.message = `An error occured while generating an WSSE token`;
                break;

            case 'script_aborted':
                this.status = 410;
                this.message = `The script was aborted`;
                break;

            default:
                this.status = 500;
                this.type = 'unhandled_' + type;
                this.message = `An unhandled error of type '${type}' with payload '${JSON.stringify(this.payload)}' has occurred`;
        }
    }

    public setPayload(payload: any) {
        this.payload = payload;
    }
}

export function isNangoErrorAsJson(obj: unknown): obj is NangoError {
    return Boolean(typeof obj === 'object' && obj && 'payload' in obj && 'type' in obj);
}

export function deserializeNangoError(err: unknown): NangoError | null {
    if (isNangoErrorAsJson(err)) {
        return new NangoError(err['type'], err.payload, err.status, err.additional_properties);
    }
    return null;
}
