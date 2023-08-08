export class NangoError extends Error {
    public readonly status: number;
    public readonly type: string;
    public payload: { [key: string]: unknown };
    public override readonly message: string;

    constructor(type: string, payload = {}) {
        super();

        this.type = type;
        this.payload = payload;

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
                this.message = 'Authentication failed. The provided secret/public key does not match any account.';
                break;

            case 'invalid_secret_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret key is invalid.';
                break;

            case 'invalid_secret_key_format':
                this.status = 401;
                this.message = 'Authentication failed. The provided secret key is not a UUID v4.';
                break;

            case 'missing_public_key':
                this.status = 401;
                this.message = 'Authentication failed. The request is missing a valid public key parameter.';
                break;

            case 'invalid_public_key':
                this.status = 401;
                this.message = 'Authentication failed. The provided public key is not a UUID v4.';
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

            case 'missing_email_param':
                this.status = 400;
                this.message = `Missing parameter 'email'.`;
                break;

            case 'missing_name_param':
                this.status = 400;
                this.message = `Missing parameter 'name'.`;
                break;

            case 'missing_password_param':
                this.status = 400;
                this.message = `Missing parameter 'password'.`;
                break;

            case 'duplicate_account':
                this.status = 409;
                this.message = 'Email already exists.';
                break;

            case 'unknown_user':
                this.status = 404;
                this.message = 'No user matching this email.';
                break;

            case 'unknown_endpoint':
                this.status = 404;
                this.message = 'The API endpoint could not be found and returned a 404. Please ensure you have the endpoint specified and spelled correctly.';
                break;

            case 'fobidden':
                this.status = 403;
                this.message = 'The API endpoint returned back a 403 error. Check the scopes requested to make sure proper access is requested to the API.';
                break;

            case 'bad_request':
                this.status = 400;
                this.message = 'The API endpoint returned back a 400 error. Check the headers to ensure all proper headers are passed to the API.';
                break;

            case 'invalid_oauth_scopes':
                this.status = 400;
                this.message = 'The requested OAuth scopes are invalid. OAuth scopes should be comma separated and not an array';
                break;

            case 'missing_environment_id':
                this.status = 400;
                this.message = `Missing param 'environment_id'.`;
                break;

            case 'invalid_invite_token':
                this.status = 400;
                this.message = 'The invite token is invalid.';
                break;

            case 'missing_api_key':
                this.status = 400;
                this.message = `Missing param 'api_key'.`;
                break;

            case 'missing_basic_username':
                this.status = 400;
                this.message = `Missing param username for basic api authentication.`;
                break;

            case 'missing_username_mismatch_template':
                this.status = 400;
                this.message = `Missing param 'username' for the provider template of Basic auth.`;
                break;

            case 'missing_password_mismatch_template':
                this.status = 400;
                this.message = `Missing param 'password' for the provider template of Basic auth.`;
                break;

            case 'missing_api_key_mismatch_template':
                this.status = 400;
                this.message = `Missing param 'api_key' for the provider template of API Key auth.`;
                break;

            case 'missing_basic_password':
                this.status = 400;
                this.message = `Missing param password for basic api authentication.`;
                break;

            case 'missing_access_token':
                this.status = 400;
                this.message = `Missing param 'access_token'.`;
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

            case 'missing_provider_template':
                this.status = 400;
                this.message = `Missing param 'provider'.`;
                break;

            case 'missing_client_id':
                this.status = 400;
                this.message = `Missing param 'oauth_client_id'.`;
                break;

            case 'missing_client_secret':
                this.status = 400;
                this.message = `Missing param 'oauth_client_secret'.`;
                break;

            case 'missing_scopes':
                this.status = 400;
                this.message = `Missing param 'oauth_scopes'.`;
                break;

            case 'missing_connection':
                this.status = 400;
                this.message = `Missing param 'connection_id'.`;
                break;

            case 'invalid_offset':
                this.status = 400;
                this.message = 'Invalid offset provided. The offset should be a number.';
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
                this.status = 400;
                this.message = `No connection matching the provided params of 'connection_id' and 'provider_config_key'.`;
                if (this.payload) {
                    this.message += ` Please make sure these values exist in the Nango dashboard ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'refresh_token_external_error':
                this.status = 400;
                this.message = `The external API returned an error when trying to refresh the access token. Please try again later.`;
                if (this.payload) {
                    this.message += ` ${JSON.stringify(this.payload, null, 2)}`;
                }
                break;

            case 'connection_already_exists':
                this.status = 409;
                this.message = 'A connection already exists for this provider configuration.';
                break;

            case 'missing_base_api_url':
                this.status = 400;
                this.message =
                    'The proxy is not supported for the provider. You can easily add support by following the instructions at https://docs.nango.dev/contribute/nango-auth. You can also use the baseUrlOverride to get started right away. See https://docs.nango.dev/guides/proxy#proxy-requests for more information.';
                break;

            case 'provider_config_edit_not_allowed':
                this.status = 400;
                this.message = 'Provider configuration cannot be edited for API key based authentication.';
                break;

            case 'invalid_auth_mode':
                this.status = 400;
                this.message = 'Invalid auth mode. The provider does not support this auth mode.';
                break;

            case 'unknown_provider_template':
                this.status = 400;
                this.message = `No Provider Template matching the 'provider' parameter.`;
                break;

            case 'duplicate_provider_config':
                this.status = 409;
                this.message = `There is already a Provider Configuration matching the param 'provider_config_key'.`;
                break;

            case 'missing_password_reset_token':
                this.status = 400;
                this.message = 'Missing reset token (or password).';
                break;

            case 'unknown_password_reset_token':
                this.status = 404;
                this.message = 'Reset password token expired on unknown.';
                break;

            case 'missing_required_fields_on_deploy':
                this.status = 400;
                this.message = 'Sync name, provider config key, the file, the models, and the runs fields are required to deploy a sync';
                break;

            case 'file_upload_error':
                this.status = 500;
                this.message = 'Error uploading file. Please contact support with the filename and connection details';
                break;

            case 'empty_insert_data_on_deploy':
                this.status = 400;
                this.message = 'The data to insert for a deploy is empty. Please try again or reach out to support with the sync name and connection details';
                break;

            case 'error_creating_sync_config':
                this.status = 500;
                this.message = 'Error creating sync config from a deploy. Please contact support with the sync name and connection details';
                break;

            case 'generic_error_support':
                this.status = 500;
                this.message = 'An error occurred. Please contact support with this unique id: ' + this.payload;
                break;

            case 'missing_id_field':
                this.status = 400;
                this.message = `Missing id field in the "${this.payload}" model. Make sure every single element in the array has an id property.`;
                break;

            case 'sync_interval_too_short':
                this.status = 400;
                this.message = 'Sync interval is too short. The minimum interval is 5 minutes.';
                break;

            default:
                this.status = 500;
                this.type = 'unhandled_' + type;
                this.message = `An unhandled error ${this.payload} has occurred: ${type}`;
        }
    }

    public setPayload(payload: any) {
        this.payload = payload;
    }
}
