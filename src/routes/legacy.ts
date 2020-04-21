import * as express from 'express'
const legacy = express.Router()

legacy.all('*', handler)

function handler(req, res) {
  res.send('Legacy')
}

export { legacy }
