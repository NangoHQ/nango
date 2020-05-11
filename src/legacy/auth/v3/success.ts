import { Response } from 'express'
import { AuthSuccessRequest } from './types'
import { asyncMiddleware } from '../../../errorHandler'
import { updateAuth, TOAuthPayload } from '../clients/integrations'

export const authSuccess = asyncMiddleware(async (req: AuthSuccessRequest, res: Response) => {
  const { connectParams, setupId, authId, credentials, store, setup } = req
  const buid = req.buid!

  const payload: TOAuthPayload = {
    connectParams,
    setupId,
    serviceName: buid,
    userId: authId,
    updatedAt: Date.now(),
    ...credentials
  }

  if (req.integrationConfig && req.integrationConfig.config) {
    payload.scopes = req.integrationConfig.config.scope || []
  }

  if (setup && setup.scopes) {
    console.log('[authSuccess] scopes', setup.scopes)
    payload.scopes = setup.scopes
  }

  if (req.tokenResponse) {
    payload.tokenResponseJSON = JSON.stringify(req.tokenResponse)
  }

  if (req.isCallback) {
    payload.callbackParamsJSON = JSON.stringify(req.query)
  }

  const params = {
    buid,
    authId,
    setupId,
    payload
  }

  await updateAuth({ ...params, store })

  res.header('Content-Type', 'text/html')
  res.render('auth/callback', { authId, error: '', error_description: '', integrationUuid: buid })
})
