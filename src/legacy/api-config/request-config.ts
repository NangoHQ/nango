import merge from 'merge'
import { OAuth } from 'oauth'

import { expandTemplate, UndefinedVariable } from './template'
import { EAuthType, AuthDetails, OAuth1AuthDetails } from '../auth/v3/types'
import { MissingApiConfigHeader, InvalidApiConfig, MissingApiConfigConnectParam } from './errors'

const labels: Record<keyof RequestConfig, string> = {
  baseURL: 'Request Base URL',
  headers: 'Request Header',
  params: 'Request Param'
}

export const expandRequestConfig = (params: ExpandRequestConfigParams): RequestConfig => {
  try {
    return expandTemplate(params.requestConfig, getVariables(params))
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

    if (e.variableName.startsWith('headers.')) {
      throw new MissingApiConfigHeader(label, subAttributeName, variableName)
    }

    throw new InvalidApiConfig(label, subAttributeName, variableName)
  }
}

const tryExpandBaseURL = (baseURL: string, variables: any) => {
  try {
    return expandTemplate(baseURL, variables)
  } catch (e) {
    return baseURL
  }
}

const getVariables = ({
  auth,
  authType,
  connectParams,
  headers,
  method,
  path,
  requestConfig
}: ExpandRequestConfigParams) => {
  const partialVariables = { auth, connectParams, headers }
  // We want any expansion errors to be caught later in the process when
  // we have the proper context for error messages
  const baseURL = tryExpandBaseURL(requestConfig.baseURL, partialVariables)

  return merge.recursive(true, partialVariables, {
    auth: additionalAuthVariables({ auth, authType, baseURL, method, path })
  })
}

const additionalAuthVariables = ({ auth, authType, baseURL, method, path }: AdditionalAuthVariablesParams) => {
  switch (authType) {
    case EAuthType.OAuth1:
      return { oauth1: getOAuth1Credentials({ baseURL, method, path, auth: auth as OAuth1AuthDetails }) }
    default:
      return {}
  }
}

export const getOAuth1Credentials = ({ baseURL, method, path, auth }: IGetOAuth1CredentialsParams) => {
  const { consumerKey, consumerSecret, accessToken, tokenSecret, signatureMethod } = auth

  const absUrl = `${baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`

  const oauth = new OAuth(
    '', // requestUrl
    '', // accessUrl
    consumerKey,
    consumerSecret,
    '1.0', // version
    '', // authorize_callback
    signatureMethod
  )

  return oauth.authHeader(absUrl, accessToken, tokenSecret, method).replace(/^OAuth /, '')
}

interface ExpandRequestConfigParams {
  auth: AuthDetails
  authType: EAuthType
  connectParams: Record<string, string>
  headers: Record<string, string>
  method: string
  path: string
  requestConfig: RequestConfig
}

export interface RequestConfig {
  baseURL: string
  headers: Record<string, string>
  params: Record<string, string>
}

interface AdditionalAuthVariablesParams {
  auth: AuthDetails
  authType: EAuthType
  baseURL: string
  method: string
  path: string
}

interface IGetOAuth1CredentialsParams {
  auth: OAuth1AuthDetails
  baseURL: string
  method: string
  path: string
}
