import omit from 'lodash.omit'

import { TBackendRequestV4 } from '../../../types'
import { AuthDetails } from '../../auth/v3/types'
import { asyncMiddleware } from '../../errorHandler'
import { stripHopByHopHeaders } from '../../proxy/headers'
import { expandRequestConfig } from '../../api-config/request-config'

export const PROXY_PREFIX = '/bearer-proxy'

export async function setProxyMiddleware(req: TBackendRequestV4, _res, next) {
  const { requestConfig, authType } = await req.integration.config()

  if (!requestConfig) {
    throw new Error('Missing request config')
  }

  const headers = stripHopByHopHeaders(req.headers)
  const { auth, method, url } = req
  const { connectParams } = auth
  const authForConfig: AuthDetails = omit(auth, 'connectParams') as any

  const path = url.replace(PROXY_PREFIX, '')
  req.template = expandRequestConfig({
    authType,
    connectParams,
    headers,
    method,
    path,
    requestConfig,
    auth: authForConfig
  })

  // console.log('req.template', req.template)

  req.userDefinedData = {
    authType,
    headers,
    method,
    path,
    data: req.body
  }

  // console.log('req.userDefinedData', req.userDefinedData)
  next()
}

export const setProxyFunction = asyncMiddleware(setProxyMiddleware)
