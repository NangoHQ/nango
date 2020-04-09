export function check(notifier?: { notify: (err: any) => void }) {
  const constants = require('./constants')
  Object.keys(constants).forEach(key => {
    if (!constants[key]) {
      const error = new Error(`Missing environment variable ${key}`)
      throw error
    }
  })
}
