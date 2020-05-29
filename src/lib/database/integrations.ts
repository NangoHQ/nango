/**
 * Basic operations with the ./integrations folder
 * to get or list the integrations within that folder.
 */

import fs from 'fs'
import path from 'path'
import { Types } from '../../types'

const integrationsDir = path.join(__dirname, '../../../', 'integrations')

/**
 * List all integrations within the folder
 * @returns an array of the integrations configuration.
 */

export const list = async (): Promise<Types.Integration[]> => {
  return new Promise((resolve, reject) => {
    fs.readdir(integrationsDir, function(err, integrationsFiles) {
      if (err) {
        return reject('Unable to access integrations directory.')
      }

      const apis: any[] = []
      integrationsFiles.forEach(function(file) {
        const fileExtension = file.split('.').pop()
        if (fileExtension !== 'json') {
          return
        }

        try {
          const fileName = file.slice(0, -5)
          const fileContent = require(path.join(integrationsDir, `${fileName}.json`))
          const integration = formatIntegration(fileName, fileContent)

          apis.push(integration)
        } catch (err) {}
      })

      resolve(apis)
    })
  })
}

/**
 * Retrieve a particular integration within the folder.
 * @param apiName
 * @returns the integration configuration.
 */

export const get = async (integrationName: string): Promise<Types.Integration> => {
  return new Promise((resolve, reject) => {
    if (!integrationName) {
      return reject('Empty integration name provided.')
    }

    try {
      const fileContent = require(path.join(integrationsDir, `${integrationName}.json`))
      const integration = formatIntegration(integrationName, fileContent)
      return resolve(integration)
    } catch (err) {
      return reject(err)
    }
  })
}

const formatIntegration = (fileName: string, fileContent: any) => {
  const integration = fileContent as Types.Integration
  integration.id = fileName
  integration.image =
    integration.image || 'http://logo.clearbit.com/' + integration.name.toLowerCase().replace(' ', '') + '.com'

  const isOAuth2 = integration.config.authType === 'OAUTH2'
  integration.config.setupKeyLabel = isOAuth2 ? 'Client ID' : 'Consumer Key'
  integration.config.setupSecretLabel = isOAuth2 ? 'Client Secret' : 'Consumer Secret'

  return integration
}

/**
 * Validation
 */

export const validateConfigurationScopes = (scopesAsString: string): string[] | null => {
  const scopes: string = ((String(scopesAsString) as string) || '').trim()

  return (scopes && scopes.split('\n')) || null
}

export const validateConfigurationCredentials = (
  setup: { [key: string]: string } | undefined,
  integration: Types.Integration
): Types.OAuth1Credentials | Types.OAuth2Credentials | undefined => {
  if (!setup) {
    return
  }

  const integrationConfig = integration.config
  const isOAuth2 = integrationConfig.authType == 'OAUTH2'
  const isOAuth1 = integrationConfig.authType == 'OAUTH1'

  if (isOAuth1) {
    const consumerKey = String(setup.consumerKey)
    const consumerSecret = String(setup.consumerSecret)

    if (consumerKey && consumerSecret) {
      return { consumerKey, consumerSecret }
    }
  } else if (isOAuth2) {
    const clientId = String(setup.clientId)
    const clientSecret = String(setup.clientSecret)

    if (clientId && clientSecret) {
      return { clientId, clientSecret }
    }
  }

  return
}
