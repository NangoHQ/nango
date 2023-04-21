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

            case 'unkown_account':
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
                this.status = 400;
                this.message = 'Email already exists.';
                break;

            case 'unkown_user':
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

            case 'missing_provider_config':
                this.status = 400;
                this.message = `Missing param 'provider_config_key'.`;
                break;

            case 'missing_callback_url':
                this.status = 400;
                this.message = `Missing param 'callback_url'.`;
                break;

            case 'unknown_provider_config':
                this.status = 400;
                this.message = `There is no Provider Configuration matching this key.`;
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

            case 'unkown_connection':
                this.status = 400;
                this.message = `No connection matching params 'connection_id' and 'provider_config_key'.`;
                break;

            case 'unknown_provider_template':
                this.status = 400;
                this.message = `No Provider Template matching the 'provider' parameter.`;
                break;

            case 'duplicate_provider_config':
                this.status = 400;
                this.message = `There is already a Provider Configuration matching the param 'provider_config_key'.`;
                break;

            case 'missing_password_reset_token':
                this.status = 400;
                this.message = 'Missing reset token (or password).';
                break;

            case 'unkown_password_reset_token':
                this.status = 404;
                this.message = 'Reset password token expired on unknown.';
                break;

            default:
                this.status = 500;
                this.type = 'unhandled_' + type;
                this.message = `An unhandled error has occured: ${type}`;
        }
    }
}
