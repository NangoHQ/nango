import Joi from '@hapi/joi'
import { Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

import { TBackendRequestV4 } from '../../types'
import { getSetupDetails, saveSetupDetails } from '../auth/clients/integrations'
import { asyncMiddleware } from '../../errorHandler'

export const setupSave = asyncMiddleware(async (req: TBackendRequestV4, res: Response, next: NextFunction) => {
  const { referenceId } = req.query
  const { buid, store } = req
  const { setup } = req.body

  console.log('[setupSave] body', req.body)
  console.log('[setupSave] setup', setup)
  console.log('[setupSave] buid', buid)

  if (!setup) {
    return res.send({
      code: 'MISSING_SETUP',
      message: 'Please provide a setup object containing information { setup: { ... } }'
    })
  }

  const { scopes } = setup
  console.log('[setupSave] scopes', scopes)

  const { error: typeError } = Joi.validate(setup, formatValidator, { abortEarly: false })
  if (typeError) {
    console.log('[setupSave] typeError', typeError)
    return res.send(typeError)
  }

  const { error } = Joi.validate(setup, validator[setup.type], { abortEarly: false })
  if (error) {
    console.log('[setupSave] error', error)
    return res.send(error)
  }

  // We can't store empty values
  for (const key in setup) {
    if (!setup[key]) {
      delete setup[key]
    }
  }

  const ref = referenceId || uuidv4()

  console.log('[setupSave] params', { buid, scopes, ref })
  await saveSetupDetails({ store, buid, setup, scopes, setupId: ref })

  res.send({
    referenceId: ref,
    ack: 'true'
  })
})

export const setupRetrieve = asyncMiddleware(async (req: TBackendRequestV4, res: Response, next: NextFunction) => {
  const { referenceId } = req.query
  const { store, buid } = req

  if (!referenceId) {
    return res.send({
      code: 'MISSING_PARAMETER',
      message: 'Please provide a referenceId'
    })
  }

  const data = await getSetupDetails({ store, buid, setupId: referenceId })
  res.send({
    referenceId,
    data: Boolean(data)
  })
})

enum AuthType {
  OAuth2 = 'OAUTH2',
  OAuth1 = 'OAUTH1'
}

const joiExtended = Joi.extend({
  name: 'authType',
  base: Joi.string()
    .valid(Object.values(AuthType))
    .required()
})

const oauth2Validator = Joi.object().keys({
  clientId: Joi.string()
    .required()
    .allow(''),
  clientSecret: Joi.string()
    .required()
    .allow(''),
  type: joiExtended.authType(),
  scopes: [Joi.array(), null]
})

const oauth1Validator = Joi.object().keys({
  consumerKey: Joi.string()
    .required()
    .allow(''),
  consumerSecret: Joi.string()
    .required()
    .allow(''),
  type: joiExtended.authType(),
  scopes: [Joi.array(), null]
})

const formatValidator = Joi.object()
  .keys({
    type: joiExtended.authType()
  })
  .unknown(true)

const validator = {
  [AuthType.OAuth2]: oauth2Validator,
  [AuthType.OAuth1]: oauth1Validator
}
