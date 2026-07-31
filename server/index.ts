import { createServer } from 'node:http'
import { createAppHandler } from './app.js'
import { loadLocalEnv } from './env.js'

loadLocalEnv()

const host = '0.0.0.0'
const isDevelopment = process.argv.includes('--dev')
const defaultPort = isDevelopment ? 8787 : 3000
const parsedPort = Number(process.env.PORT || process.env.LABEL_LENS_SERVER_PORT || defaultPort)
const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort
const appHandler = createAppHandler()
const server = createServer((request, response) => {
  void appHandler(request, response).catch(() => {
    if (response.headersSent) {
      response.end()
      return
    }
    response.writeHead(500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify({ error: '服务暂时无法处理请求。' }))
  })
})

server.on('error', (error) => {
  console.error(`LabelLens 服务启动失败：${error.message}`)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`LabelLens 服务已启动：http://${host}:${port}`)
  if (!process.env.INFINISYNAPSE_API_KEY?.trim()) {
    console.warn('未配置 INFINISYNAPSE_API_KEY；/api/analyze 将返回安全错误。')
  }
})
