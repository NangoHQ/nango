import { Response, NextFunction } from 'express'

import { TBackendRequestV4 } from '../../types'
import { asyncMiddleware } from '../errorHandler'
import { proxyHandler } from '../proxy/function'
import { GenericFunctionError, UserError } from '../errors'

export const BUID = 'bearerUid'
const FAILING_HEADER_VALUE = new Set([undefined, null, ''])
const PROXY_HEADER_BLACKLIST = new Set<string>(['connection', 'upgrade'])

const defaultFilterKeys = ['authorization', 'apikey', 'api_key', 'code', 'password', 'secret', 'token']

export const middleware = () =>
  asyncMiddleware(async (req: TBackendRequestV4, res: Response, next: NextFunction) => {
    const { auth, authId } = req

    // use the clientId retrieved from the checkAuthorization middleware
    // const clientId: string = req.clientId || req.query.clientId || ''
    // allow option to overwrite setupId in query
    const setupId: string = req.query.setupId || req.setupId
    // console.log('in lambda request middleware')

    try {
      const payload = {
        body: req.body,
        queryStringParameters: { ...req.params, ...req.query, authId, setupId },
        template: req.template,
        userDefinedData: req.userDefinedData,
        context: {
          auth,
          isBackend: Boolean(req.isBackend),
          metadata: {
            filterKeys: defaultFilterKeys
          }
        }
      }

      // console.log(payload)
      const response = await proxyHandler(payload)
      const { StatusCode, Payload } = response

      // console.log(response)
      // console.log(StatusCode)
      // console.log(Payload)

      // if (Payload.data.error) {
      //   const { StatusCode, data: error } = Payload
      //   return res.status(statusCode || 422).send({ error })
      // }

      const { data, headers } = Payload

      // console.log(data)
      // console.log(Payload)

      for (const headerName in headers) {
        if (headers.hasOwnProperty(headerName) && !PROXY_HEADER_BLACKLIST.has(headerName.toLowerCase())) {
          const value = headers[headerName]
          if (!FAILING_HEADER_VALUE.has(value)) {
            res.setHeader(headerName, headers[headerName])
          }
        }
      }
      res.status(StatusCode).send(data)

      // next()
    } catch (e) {
      // re-throw the correct error
      if (e instanceof UserError) {
        throw e
      }

      throw new GenericFunctionError(req, e)
    }
  })
