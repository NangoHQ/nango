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
  const { connectParams, buid, setup } = req

  return {
    setupDetails: setup,
    integrationConfig: expandAuthConfig({
      connectParams,
      authConfig: (await getConfig({
        buid: buid!
      })) as any
    })
    // setupDetails: { clientID: '150714643009.1056243521876', clientSecret: '851aaa8e41fa28c9c5182085445b7d01' }
  } as IAuthConfig
}

const copyConfig = (src: IAuthConfig, dest: IAuthConfig) => {
  dest.integrationConfig = src.integrationConfig
  dest.setupDetails = src.setupDetails
}

export const connectConfig = asyncMiddleware(async (req: TConnectConfigRequest, _res: Response, next: NextFunction) => {
  const authConfig = await getAuthConfig(req)
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
  copyConfig(req.session.authConfig, req)

  next()
}
