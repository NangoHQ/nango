export enum Events {
  SESSION_INITIALIZED = 'BEARER_SESSION_INITIALIZED',
  HAS_AUTHORIZED = 'BEARER_HAS_AUTHORIZED',
  AUTHORIZED = 'BEARER_AUTHORIZED',
  REJECTED = 'BEARER_REJECTED',
  REVOKE = 'BEARER_REVOKE',
  REVOKE_SUCCEEDED = 'BEARER_REVOKED',
  REVOKE_FAILED = 'BEARER_REVOKED_FAILED'
}

export type THasAuthorizedPayload = {
  data: {
    scenarioId: string
    clientId: string
  }
}

export type THasAuthorizedResponse = {
  authorized: boolean
}

export type TLogoutPayload = {
  data: {
    scenarioId: string
    clientId: string
    authId: string
  }
}
