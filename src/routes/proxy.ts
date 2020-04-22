import * as express from 'express'
import * as legacy from './legacy'
const proxy = express.Router()

proxy.use('/', legacy.proxy)

export { proxy }
