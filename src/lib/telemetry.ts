const path = require('path')
const fs = require('fs')
import { v4 as uuidv4 } from 'uuid'

export default (): string => {
  const isEnabled = process.env.TELEMETRY === 'FALSE' ? false : true

  if (!isEnabled) {
    console.log('Telemetry is disabled')
    return ''
  }

  try {
    // Get UUID from package.json
    const rootDir = path.join(__dirname, '../../../')
    const config = require(rootDir + 'package.json')

    // If found, return UUID
    if (config.pizzly && config.pizzly.uuid) {
      return config.pizzly.uuid
    }

    // If none, create UUID and return it
    config.pizzly = { ...config.pizzly }
    config.pizzly.uuid = uuidv4()

    fs.writeFileSync(rootDir + 'package.json', JSON.stringify(config, null, 2))

    return config.pizzly.uuid
  } catch (err) {
    return ''
  }
}
