/**
 * Basic operations with the ./integrations folder
 * to get or list the integrations within that folder.
 */

import fs from 'fs'
import path from 'path'

const integrationsDir = path.join(__dirname, '../../../', 'integrations')

/**
 * List all integrations within the folder
 * @returns an array of the integrations configuration.
 */

const list = async (): Promise<any[]> => {
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
          const api = require(path.join(integrationsDir, file))
          apis.push({ ...api, id: file.slice(0, -5) })
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

const get = async (integrationName: string): Promise<Integration> => {
  return new Promise((resolve, reject) => {
    if (!integrationName) {
      return reject('Empty integration name provided.')
    }

    try {
      const integration = require(path.join(integrationsDir, `${integrationName}.json`))

      const isOAuth2 = integration.config.authType === 'OAUTH2'
      integration.config.setupKeyLabel = isOAuth2 ? 'Client ID' : 'Consumer Key'
      integration.config.setupSecretLabel = isOAuth2 ? 'Client Secret' : 'Consumer Secret'

      return resolve(integration)
    } catch (err) {
      return reject(err)
    }
  })
}

interface Integration {
  config: {
    setupKeyLabel: string
    setupSecretLabel: string
  }
}

export { get, list }
