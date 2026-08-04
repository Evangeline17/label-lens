import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, stat } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const playwrightPath = process.env.LABELLENS_PLAYWRIGHT_PATH

if (!playwrightPath) {
  throw new Error('LABELLENS_PLAYWRIGHT_PATH is required.')
}

const { chromium } = require(playwrightPath)
const sourceDir = dirname(fileURLToPath(import.meta.url))
const launchDir = dirname(sourceDir)
const assetsDir = join(launchDir, 'assets')
const htmlUrl = pathToFileURL(join(sourceDir, 'cards.html')).href
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

const cards = [
  ['card1', '01_cover.png'],
  ['card2', '02_why_i_made_it.png'],
  ['card3', '03_what_it_does.png'],
  ['card4', '04_image_recognition.png'],
  ['card5', '05_custom_requirements.png'],
  ['card6', '06_comparison_results.png'],
  ['card7', '07_ai_suggestion.png'],
  ['card8', '08_feedback_invitation.png'],
]

await mkdir(assetsDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'],
})

try {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1440 },
    deviceScaleFactor: 1,
  })

  for (const [hash, name] of cards) {
    await page.goto(`${htmlUrl}#${hash}`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const outputPath = join(assetsDir, name)
    await page.screenshot({ path: outputPath, fullPage: false })
    const info = await stat(outputPath)
    if (info.size < 1024) throw new Error(`Exported file is unexpectedly small: ${name}`)
  }
} finally {
  await browser.close()
}

console.log(`Exported ${cards.length} cards to ${assetsDir}`)
