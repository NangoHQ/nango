export enum Events {
  SESSION_INITIALIZED = 'PIZZLY_SESSION_INITIALIZED',
  HAS_AUTHORIZED = 'PIZZLY_HAS_AUTHORIZED',
  AUTHORIZED = 'PIZZLY_AUTHORIZED',
  REJECTED = 'PIZZLY_REJECTED',
  REVOKE = 'PIZZLY_REVOKE',
  REVOKE_SUCCEEDED = 'PIZZLY_REVOKED',
  REVOKE_FAILED = 'PIZZLY_REVOKED_FAILED'
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
