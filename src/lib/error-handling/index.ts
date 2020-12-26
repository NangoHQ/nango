/**
 * Custom error to ease how we handle error
 * in Pizzly's codebase.
 */

export class PizzlyError extends Error {
  public readonly status: number
  public readonly type: string
  public readonly message: string

  constructor(type: string) {
    super()

    this.type = type

    switch (type) {
      // Authentications errors (401)
      case 'missing_publishable_key':
        this.status = 401
        this.message = 'Authentication failed. The request is missing a valid publishable key.'
        break

      case 'invalid_publishable_key':
        this.status = 401
        this.message = 'Authentication failed. The provided publishable key is invalid.'
        break

      case 'missing_secret_key':
        this.status = 401
        this.message = 'Authentication failed. The request is missing a valid secret key.'
        break

      case 'invalid_secret_key':
        this.status = 401
        this.message = 'Authentication failed. The provided secret key is invalid.'
        break

      // Missing a params errors (400)
      case 'missing_auth_id':
        this.status = 400
        this.message = 'A valid auth_id (string) is required to proceed with the request.'
        break

      case 'missing_setup_id':
        this.status = 400
        this.message = 'A valid setup_id (string) is required to proceed with the request.'
        break

      case 'missing_oauth_payload':
        this.status = 400
        this.message = 'A valid payload (OAuth2Payload | OAuth1Payload) is required to proceed with the request.'
        break

      // Unknown params errors (404)
      case 'unknown_integration':
        this.status = 404
        this.message = 'The provided integration could not be found on the server.'
        break

      case 'unknown_authentication':
        this.status = 404
        this.message = 'That authentication (auth_id) could not be found with the provided integration.'
        break

      case 'unknown_configuration':
        this.status = 404
        this.message = 'That configuration (setup_id) could not be found with the provided integration.'
        break

      // Invalid params (400)
      case 'invalid_authentication':
        this.status = 400
        this.message = 'The authentication (auth_id) is malformed. Must be in the form string.'
        break

      case 'invalid_credentials':
        this.status = 400
        this.message =
          'Credentials are malformed. Must be an object in the form "{ clientId:string, clientSecret:string }" for an OAuth2 based API or "{ consumerKey:string, consumerSecret:string }" for an OAuth1 based API.'
        break

      case 'invalid_scopes':
        this.status = 400
        this.message = 'Scopes are malformed. Must be in the form string[].'
        break

      case 'invalid_oauth_payload':
        this.status = 400
        this.message =
          'The OAuth payload provided is malformed. Must be an object in the form OAuth1Payload or OAuth2Payload. Learn more at https://github.com/bearer/pizzly/wiki/Reference-:-API'
        break

      // Something failed
      case 'token_refresh_missing':
        this.status = 422
        this.message =
          'Unable to refresh the token. That user has no refresh token. The API might have not providing one.'
        break

      case 'token_refresh_failed':
        this.status = 422
        this.message = 'Unable to refresh the token. Please re-connect that user.'
        break

      // General case for unhandled errors
      default:
        this.status = 500
        this.type = 'unhandled_' + type
        this.message = 'An unhandled error has occurend'
    }
  }
}
