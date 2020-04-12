import { Router, NextFunction } from 'express'

import errorHandler from '../errorHandler'
import { setupSave, setupRetrieve } from './setup-details'
import { proxyCorsMiddleware } from '../proxy/cors'
import { fetchAuthDetails } from '../auth/v3/strategy'
import { middleware as proxyHandler } from '../functions/lambda-request'
import { PROXY_PREFIX, setProxyFunction } from '../middlewares/v4/intent-info'
import Integration from './integration'

const BUID = 'bearerUuid'

// function here(req, _res, next) {
//   console.log('here')
//   next()
// }

function functionsRouter() {
  const functionsRouter = Router({ mergeParams: true })

  functionsRouter.all(`${PROXY_PREFIX}/*`, fetchAuthDetails, setProxyFunction, proxyHandler())
  functionsRouter.post('/setup-save', setupSave)
  functionsRouter.post('/setup-retrieve', setupRetrieve)
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
  router.use(`/:${BUID}`, proxyCorsMiddleware, buid, authId, setProxyCallType, proxyRouter())
  router.use(errorHandler)
  return router
}

function authId(req, _res, next) {
  req.authId = req.headers['bearer-auth-id'] || req.query.authId
  next()
}

function buid(req, _res, next) {
  req.buid = req.params[BUID]
  req.integration = new Integration(req.buid)
  next()
}

function isBackendRequest(req, _res, next) {
  req.isBackend = true
  next()
}
