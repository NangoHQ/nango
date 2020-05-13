import { UserError } from '../../errors'
import { EAuthType } from './types'
import { Request } from 'express'
import { GrantType } from './strategies/oauth2'

export class NoAuthInProgress extends UserError {
  constructor() {
    super(
      `The callback was invoked whilst no authentication was in progress. ` +
        `Either too much time has elapsed between starting authentication and the callback being invoked, ` +
        `or the callback was invoked without first calling the integration's authentication endpoint. Please try again`,
      422,
      'NO_AUTH_IN_PROGRESS'
    )
  }
}
export class InvalidAuthType extends UserError {
  constructor(authType: string) {
    const allowedValues = Object.values(EAuthType)
      .map(authType => `'${authType}'`)
      .join(', ')
    super(
      `Invalid authType '${authType}'. Please check the integration's auth.config.json file. ` +
        `Allowed values are ${allowedValues}`,
      422,
      'INVALID_AUTH_TYPE'
    )
  }
}

export class InvalidGrantType extends UserError {
  constructor(grantType: string) {
    const allowedValues = Object.values(GrantType)
      .map(grantType => `'${grantType}'`)
      .join(', ')
    super(
      `Invalid grantType '${grantType}'. Please check the API's configuration. ` +
        `Allowed values are ${allowedValues}`,
      422,
      'INVALID_GRANT_TYPE'
    )
  }
}

export class OAuthOnlyEndpoint extends UserError {
  constructor(authType: string) {
    super(
      "This endpoint is only for 'OAUTH1' and 'OAUTH2' auth types " +
        `but the integration is configured with authType '${authType}'`,
      422,
      'OAUTH_ONLY_ENDPOINT'
    )
  }
}

export class AuthenticationFailed extends UserError {
  readonly error: string
  readonly errorDescription?: string

  static fromOAuthRequest(req: Request, info: any) {
    if (req.query.error) {
      return new AuthenticationFailed(req.query)
    }

    return new AuthenticationFailed(info)
  }

  constructor(details: any) {
    super(`Authentication failed:\n${JSON.stringify(details, undefined, 2)}`, 403, 'AUTHENTICATION_FAILED')

    if (details.error) {
      this.error = details.error
      this.errorDescription = details.error_description
    } else {
      this.errorDescription = this.error = JSON.stringify(details)
    }
  }
}

export class AccessTokenExpired extends UserError {
  constructor() {
    super(
      `The access token associated with your Auth Id has expired and token refreshing is not supported for \
this API. Please reconnect to obtain a new access token.

Consult the API provider's documentation to determine whether refresh tokens can be enabled for this API`,
      403,
      'ACCESS_TOKEN_EXPIRED'
    )
  }
}

export class InconsistentSetupId extends UserError {
  constructor() {
    super(
      'The provided setupId does not match the setupId used when connecting. ' +
        'Please reconnect using this setupId, or retry this call with the ' +
        'setupId corresponding to the authId',
      422,
      'INCONSISTENT_SETUP_ID'
    )
  }
}

export class InvalidAuthId extends UserError {
  constructor(buid: string, authId: string) {
    super(
      `No auth details were found using authId '${authId}' for API '${buid}'

Please try again with a valid authId or connect with this authId`,
      404,
      'INVALID_AUTH_ID'
    )
  }
}

export class MissingAuthId extends UserError {
  constructor(buid: string) {
    super(
      `You must supply an authId to use the '${buid}' API

Please try again with a valid authId.

See the following link for information on how to obtain an authId: https://docs.bearer.sh/faq/connect-button`,
      401,
      'MISSING_AUTH_ID'
    )
  }
}

export class CredentialsNotConfigured extends UserError {
  constructor(buid: string) {
    super(
      `Missing credentials for the '${buid}' API

Please configure the credentials in the dashboard and try again.

See the following link for information: https://docs.bearer.sh/dashboard/apis`,
      422,
      'CREDENTIALS_NOT_CONFIGURED'
    )
  }
}
