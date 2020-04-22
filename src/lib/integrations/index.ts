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

const get = async (apiName: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    if (!apiName) {
      return reject('Empty API name provided.')
    }

    try {
      const api = require(path.join(integrationsDir, `${apiName}.json`))
      return resolve(api)
    } catch (err) {
      return reject(err)
    }
  })
}

export { get, list }
