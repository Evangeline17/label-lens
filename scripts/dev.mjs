import { spawn } from 'node:child_process'

function startScript(script) {
  if (process.platform === 'win32') {
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${script}`], {
      stdio: 'inherit',
      windowsHide: true,
    })
  }
  return spawn('npm', ['run', script], { stdio: 'inherit' })
}
const children = [
  startScript('dev:web'),
  startScript('dev:server'),
]

let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exitCode = exitCode
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`开发进程启动失败：${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code, signal) => {
    if (!shuttingDown && (code !== 0 || signal)) shutdown(code ?? 1)
  })
}

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
