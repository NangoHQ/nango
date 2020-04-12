import { asyncMiddleware } from '../../errorHandler'
import { IAuthConfig, EAuthType, TConnectConfigRequest, TCallbackConfigRequest } from './types'
import { NextFunction, Response } from 'express'
import {
  getConfig
  // getSetupDetails
} from '../../clients/integrations'
import { InvalidAuthType } from './errors'
import { expandAuthConfig } from '../../api-config/auth-config'

const getAuthConfig = async (req: TConnectConfigRequest) => {
  const {
    // clientId,
    connectParams,
    buid
    // setupId
  } = req

  return {
    integrationConfig: expandAuthConfig({
      connectParams,
      authConfig: (await getConfig({
        buid: buid!
      })) as any
    }),
    setupDetails: { clientID: '***REMOVED***', clientSecret: '***REMOVED***' }
    // setupDetails: await getSetupDetails({
    //   clientId,
    //   setupId,
    //   buid: buid!,
    //   scopedUserDataTableName: stageVariables.scopedUserDataTableId
    // })
  } as IAuthConfig
}

const copyConfig = (src: IAuthConfig, dest: IAuthConfig) => {
  dest.integrationConfig = src.integrationConfig
  dest.setupDetails = src.setupDetails
}

export const connectConfig = asyncMiddleware(async (req: TConnectConfigRequest, _res: Response, next: NextFunction) => {
  const authConfig = await getAuthConfig(req)
  console.log('[connectConfig] req', JSON.stringify(req, null, 2))
  console.log('[connectConfig] authConfig', JSON.stringify(authConfig, null, 2))
  const { authType } = authConfig.integrationConfig
  console.log('[connectConfig] authType', authType)

  if (!Object.values(EAuthType).includes(authType)) {
    throw new InvalidAuthType(authType)
  }

  copyConfig(authConfig, req)
  req.session.authConfig = authConfig

  next()
})

export const callbackConfig = (req: TCallbackConfigRequest, _res: Response, next: NextFunction) => {
  // console.log('authConfig', req.session.authConfig)

  copyConfig(req.session.authConfig, req)

  // console.log('integrationConfig', req.integrationConfig)
  // console.log('setupDetails', req.setupDetails)
  next()
}
