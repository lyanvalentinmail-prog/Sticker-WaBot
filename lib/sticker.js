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
 * Lee el ancho × alto reales de un WebP (cabeceras VP8X / VP8 / VP8L),
 * sin librerías nativas.
 */
function webpSize(buffer) {
  try {
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
      return null
    }
    const type = buffer.toString('ascii', 12, 16)
    if (type === 'VP8X') {           // contenedor extendido (p. ej. con EXIF)
      return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 }
    }
    if (type === 'VP8 ') {           // con pérdida
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
    }
    if (type === 'VP8L') {           // sin pérdida
      const b = buffer.readUInt32LE(21)
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Convierte la foto en sticker WebP (proporción original intacta)
 * y le inyecta los metadatos EXIF del pack.
 *
 * Devuelve el sticker junto con su ancho y alto REALES, para poder
 * declararlos en el mensaje: si no se declaran, WhatsApp lo muestra
 * siempre como un cuadrado de 512×512.
 */
async function toSticker(buffer, { pack = 'Sticker-WaBot', author = 'Sticker-Bot' } = {}) {
  const webp = await imageToWebp(buffer)
  const sticker = await addExif(webp, { pack, author, emojis: ['✨'] })
  const size = webpSize(sticker) || { width: MAX_SIDE, height: MAX_SIDE }
  return { sticker, width: size.width, height: size.height }
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

module.exports = { toSticker, addExif, webpSize }
