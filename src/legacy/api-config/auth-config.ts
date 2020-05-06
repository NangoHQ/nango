import pick from 'lodash.pick'

import { expandTemplate, UndefinedVariable } from './template'
import { EAuthType, OAuth1SignatureMethod } from '../auth/v3/types'
import { InvalidApiConfig, MissingApiConfigConnectParam } from './errors'
import { AuthorizationMethod, BodyFormat } from '../auth/clients/oauth2'
import { GrantType } from '../auth/v3/strategies/oauth2'

const labels: Record<string, string> = {
  accessTokenURL: 'Access Token URL',
  authorizationURL: 'Authorization URL',
  authorizationParams: 'Authorization Param',
  requestTokenURL: 'Request Token URL',
  tokenParams: 'Token Param',
  tokenURL: 'Token URL',
  refreshURL: 'Refresh URL',
  userAuthorizationURL: 'User Authorization URL'
}

export const expandAuthConfig = ({ connectParams, authConfig }: ExpandAuthConfigParams): AuthConfig => {
  const template = pick(
    authConfig,
    'accessTokenURL',
    'authorizationURL',
    'authorizationParams',
    'requestTokenURL',
    'tokenParams',
    'tokenURL',
    'refreshURL',
    'userAuthorizationURL'
  )

  try {
    return {
      ...authConfig,
      ...expandTemplate(template, { connectParams })
    }
  } catch (e) {
    if (!(e instanceof UndefinedVariable)) {
      throw e
    }

    const { templatePath, variableName } = e
    const [attributeName, subAttributeName] = templatePath.split('.')
    const label = labels[attributeName]

    if (e.variableName.startsWith('connectParams.')) {
      throw new MissingApiConfigConnectParam(label, subAttributeName, variableName)
    }

    throw new InvalidApiConfig(label, subAttributeName, variableName)
  }
}

interface ExpandAuthConfigParams {
  connectParams: Record<string, string>
  authConfig: AuthConfig
}

export interface OAuth1AuthConfig {
  authType: EAuthType.OAuth1
  accessTokenURL: string
  authorizationParams?: Record<string, string>
  requestTokenURL: string
  signatureMethod?: OAuth1SignatureMethod
  tokenParams?: Record<string, string>
  userAuthorizationURL: string
}

interface OAuth2AuthConfig {
  authType: EAuthType.OAuth2
  authorizationMethod?: AuthorizationMethod
  bodyFormat?: BodyFormat
  config?: {
    scope?: string[]
  }
  tokenParams?: Record<string, string>
  tokenURL: string
  refreshURL?: string
}

export interface OAuth2AuthCodeConfig extends OAuth2AuthConfig {
  grantType: GrantType.AuthCode
  authorizationURL: string
  authorizationParams?: Record<string, string>
}

export interface OAuth2ClientCredentialsConfig extends OAuth2AuthConfig {
  grantType: GrantType.ClientCredentials
}

export type AuthConfig = OAuth1AuthConfig | OAuth2AuthConfig
