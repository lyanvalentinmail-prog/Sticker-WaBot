const { spawn } = require('child_process')
const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { Image } = require('node-webpmux')

// WhatsApp recomienda stickers de hasta 512px por lado.
// El bot NO recorta ni deforma la foto: conserva su proporción
// (ancho × largo) exactamente igual a la original.
const MAX_SIDE = 512

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-v', 'error', ...args])
    let stderr = ''
    ff.stderr.on('data', d => { stderr += d.toString() })
    ff.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('No se encontró "ffmpeg". En Termux instálalo con: pkg install ffmpeg -y'))
      } else {
        reject(err)
      }
    })
    ff.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg terminó con código ${code}: ${stderr.trim().slice(-300)}`))
    })
  })
}

/**
 * Convierte una imagen (buffer jpg/png/webp) en WebP usando ffmpeg.
 * El filtro scale solo reduce (nunca agranda) y mantiene la proporción
 * ancho × largo de la foto original.
 */
async function imageToWebp(buffer) {
  const id = crypto.randomBytes(8).toString('hex')
  const input = path.join(os.tmpdir(), `stw-${id}.img`)
  const output = path.join(os.tmpdir(), `stw-${id}.webp`)

  await fs.writeFile(input, buffer)
  try {
    await runFfmpeg([
      '-y',
      '-i', input,
      '-vf', `scale=w='min(${MAX_SIDE},iw)':h='min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease`,
      '-c:v', 'libwebp',
      '-quality', '90',
      '-preset', 'picture',
      '-frames:v', '1',
      output
    ])
    return await fs.readFile(output)
  } finally {
    await fs.unlink(input).catch(() => {})
    await fs.unlink(output).catch(() => {})
  }
}

/**
 * Convierte la foto en sticker WebP (proporción original intacta)
 * y le inyecta los metadatos EXIF del pack.
 */
async function toSticker(buffer, { pack = 'Sticker-WaBot', author = 'Sticker-Bot' } = {}) {
  const webp = await imageToWebp(buffer)
  return addExif(webp, { pack, author, emojis: ['✨'] })
}

/**
 * Inyecta los metadatos EXIF (nombre del pack / autor) al WebP,
 * para que WhatsApp lo reconozca como sticker con pack propio.
 */
async function addExif(webpBuffer, { pack, author, emojis = [] }) {
  const img = new Image()

  const json = {
    'sticker-pack-id': crypto.randomUUID(),
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
    'android-app-store-link': '',
    'ios-app-store-link': '',
    'emojis': emojis
  }

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ])
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf-8')
  const exif = Buffer.concat([exifAttr, jsonBuffer])
  exif.writeUIntLE(jsonBuffer.length, 14, 4)

  await img.load(webpBuffer)
  img.exif = exif
  return await img.save(null)
}

module.exports = { toSticker, addExif }
