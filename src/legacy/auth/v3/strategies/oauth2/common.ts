import jwt from 'jsonwebtoken'

import { TokenResult } from '../../../clients/oauth2'
import { IOAuth2Credentials } from '../../types'

export const NO_VALUE = 'non'

export const responseToCredentials = ({ accessToken, refreshToken, idToken, expiresIn }: TokenResult) => {
  const credentials: IOAuth2Credentials = {
    accessToken,
    refreshToken: refreshToken || NO_VALUE,
    idToken: idToken || NO_VALUE,
    expiresIn: expiresIn || 0
  }

  if (idToken) {
    credentials.idTokenJwt = getIdTokenJwt(idToken)
  }

  return credentials
}

export const getIdTokenJwt = (idToken?: string) => {
  if (!idToken) {
    return undefined
  }

  try {
    return jwt.decode(idToken) || undefined
  } catch (e) {
    return undefined
  }
}
