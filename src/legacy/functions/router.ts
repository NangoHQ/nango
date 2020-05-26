import { Router, NextFunction } from 'express'

import errorHandler from '../../legacy/errorHandler'
import { proxyCorsMiddleware } from '../proxy/cors'
import { fetchAuthDetails } from '../auth/v3/strategy'
import { middleware as proxyHandler } from './lambda-request'
import { PROXY_PREFIX, setProxyFunction } from '../middlewares/v4/intent-info'
import Integration from './integration'
import { getSetupDetails } from '../auth/clients/integrations'
import { PizzlyError } from '../../lib/error-handling'

const BUID = 'bearerUuid'

function functionsRouter() {
  const functionsRouter = Router({ mergeParams: true })

  functionsRouter.all(`${PROXY_PREFIX}/*`, setupId, fetchAuthDetails, setProxyFunction, proxyHandler())
  functionsRouter.use((_req, res) => res.status(404).send())
  functionsRouter.use(errorHandler)

  return functionsRouter
}

function proxyRouter() {
  const proxyRouter = Router({ mergeParams: true })

  proxyRouter.all(`/*`, fetchAuthDetails, setProxyFunction, proxyHandler)
  return proxyRouter
}

function setProxyCallType(req: any, _res, next: NextFunction) {
  const apiKey = (req.headers && req.headers.authorization) || req.query.apiKey
  if (apiKey) {
    req.isBackend = true
  } else {
    req.isBackend = false
  }

  next()
}

export default () => {
  const router = Router()
  router.use(`/backend/:${BUID}`, buid, authId, isBackendRequest, functionsRouter())
  router.use(`/:${BUID}`, buid, authId, functionsRouter())
  router.use(errorHandler)

  return router
}

export function proxyFunction() {
  const router = Router()
  router.use(`/:${BUID}`, proxyCorsMiddleware, buid, setupId, authId, setProxyCallType, proxyRouter())
  router.use(errorHandler)
  return router
}

function authId(req, _res, next) {
  req.authId = req.headers['bearer-auth-id'] || req.headers['pizzly-auth-id'] || req.query.authId
  next()
}

function buid(req, _res, next) {
  req.buid = req.params[BUID]
  req.integration = new Integration(req.buid)
  next()
}

export async function setupId(req, _res, next) {
  const configuration = await getSetupDetails({ buid: req.buid, store: req.store, setupId: req.query.setupId })

  if (!configuration) {
    return next(new PizzlyError('unknown_configuration'))
  }

  req.setupId = configuration.setupId
  req.configuration = configuration

  next()
}

function isBackendRequest(req, _res, next) {
  req.isBackend = true
  next()
}
