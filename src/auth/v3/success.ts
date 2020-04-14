import { Response } from 'express'
import { AuthSuccessRequest } from './types'
import { asyncMiddleware } from '../../errorHandler'
import { updateAuth, TAuthUserAttributes } from '../../clients/integrations'

export const authSuccess = asyncMiddleware(async (req: AuthSuccessRequest, res: Response) => {
  const {
    // clientId,
    connectParams,
    setupId,
    authId,
    credentials,
    store
  } = req
  const buid = req.buid!

  const userAttributes: TAuthUserAttributes = {
    connectParams,
    setupId,
    serviceName: buid,
    userId: authId,
    updatedAt: Date.now(),
    ...credentials
  }

  if (req.integrationConfig && req.integrationConfig.config) {
    userAttributes.scopes = req.integrationConfig.config.scope || []
  }

  if (req.tokenResponse) {
    userAttributes.tokenResponseJSON = JSON.stringify(req.tokenResponse)
  }

  if (req.isCallback) {
    userAttributes.callbackParamsJSON = JSON.stringify(req.query)
  }

  const params = {
    buid,
    authId,
    userAttributes
  }

  console.log('[authSuccess] userAttributes', params)

  const row = await updateAuth({ ...params, store })

  console.log('[authSuccess] userAttributes', row)

  res.header('Content-Type', 'text/html')
  res.render('callback', { authId, error: '', error_description: '', integrationUuid: buid })
})
