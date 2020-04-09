import { Request, Response, NextFunction } from 'express'

const allowedProxyMethods = 'OPTIONS, GET, HEAD, POST, PUT, PATCH, DELETE'

export const proxyCorsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', req.get('Origin') || '*')
  res.header('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', allowedProxyMethods)
    res.header('Access-Control-Allow-Headers', req.get('Access-Control-Request-Headers'))

    return res.sendStatus(204)
  }
  next()
}

export const cors = (req: Request, res: Response, next: NextFunction) => {
  // This is a temporary measure. Eventually, we need to separate out the proxy
  // routing from the rest of the app so we can use the proxy middleware on it's own
  if (req.originalUrl.includes('bearer-proxy')) {
    return proxyCorsMiddleware(req, res, next)
  }

  res.header('Access-Control-Allow-Origin', req.get('origin') || '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, User-Agent, Authorization, Bearer-Publishable-Key'
  )
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, DELETE')
  res.header('Access-Control-Allow-Credentials', 'true')
  if ('OPTIONS' === req.method) {
    res.send(204)
  } else {
    res.header('Content-Type', 'application/json')
    next()
  }
}
