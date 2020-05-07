import { Response, NextFunction } from 'express'

import { IntegrationServiceRequest } from '../../types'
import { asyncMiddleware } from '../errorHandler'
import Integration from '../functions/integration'

export const configureAuthDetailsRequest = asyncMiddleware(
  async (req: AuthDetailsRequestInput, _res: Response, next: NextFunction) => {
    const { buid, authId } = req.params

    req.authId = authId
    console.log('[configureAuthDetailsRequest] buid', buid)
    console.log('[configureAuthDetailsRequest] authId', authId)

    req.integration = new Integration(buid)

    console.log('[configureAuthDetailsRequest] integration', JSON.stringify(req.integration))

    next()
  }
)

export interface AuthDetailsRequest extends IntegrationServiceRequest {
  authId: string
  buid: string
  integration: Integration
  setupId: string
}

interface AuthDetailsRequestInput extends AuthDetailsRequest {
  params: {
    buid: string
    authId: string
  }
}
