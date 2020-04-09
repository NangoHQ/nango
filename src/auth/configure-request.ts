import { Response, NextFunction } from 'express'

import { IntegrationServiceRequest } from '../types'
import { asyncMiddleware } from '../errorHandler'
import Integration from '../functions/integration'

export const configureAuthDetailsRequest = asyncMiddleware(
  async (req: AuthDetailsRequestInput, res: Response, next: NextFunction) => {
    const { aliasBuid, authId, setupId } = req.params
    // const bearerKey = req.get('authorization')

    req.authId = authId
    req.buid = aliasBuid
    req.integration = new Integration(req.buid)
    req.setupId = setupId

    next()
  }
)

export interface AuthDetailsRequest extends IntegrationServiceRequest {
  aliasBuid: string
  authId: string
  buid: string
  integration: Integration
  setupId: string
}

interface AuthDetailsRequestInput extends AuthDetailsRequest {
  params: {
    aliasBuid: string
    authId: string
    setupId: string
  }
}
