const crypto = require('crypto')
const { Jimp } = require('jimp')
const { Image } = require('node-webpmux')

// WhatsApp EXIGE stickers de exactamente 512×512 px (lienzo cuadrado).
// Si el WebP no es un cuadrado, el cliente lo estira hasta 512×512.
// Solución: la foto se coloca CON SU PROPORCIÓN EXACTA (nunca deformada)
// sobre un lienzo 512×512 transparente.
//
// TODO el proceso es 100% JavaScript/WASM (jimp + node-webpmux):
// NO requiere ffmpeg, NO requiere sharp ni ninguna librería nativa.
// Funciona igual en Termux, servidores Linux y paneles de hosting.
const SIZE = 512

// Límites de tamaño que WhatsApp aplica a los stickers
// (≥~100 KB el estático y ≥~500 KB el animado se rechazan silenciosamente).
const MAX_STATIC_BYTES = 95 * 1024
const MAX_ANIM_BYTES = 450 * 1024

// Inicializa la libwebp WASM una sola vez (lazy, en el primer uso)
let libPromise = null
function ensureLib() {
  if (!libPromise) libPromise = Image.initLib()
  return libPromise
}

/**
 * Decodifica cualquier imagen (JPG, PNG, WEBP, GIF, BMP, TIFF) a un
 * objeto Jimp. Acepta también objetos Jimp directamente (los devuelve
 * intactos, sin re-codificar). jimp cubre los formatos comunes; para
 * WEBP (que jimp no decodifica) se usa el decodificador WebP/WASM de
 * node-webpmux.
 */
async function decodeToJimp(buffer) {
  if (buffer?.bitmap?.data) return buffer // ya es una imagen Jimp
  try {
    return await Jimp.read(buffer)
  } catch {
    await ensureLib()
    const img = new Image()
    await img.load(buffer)
    const pixels = await img.getImageData() // RGBA crudo
    return new Jimp({ data: pixels, width: img.width, height: img.height })
  }
}

/** Codifica un bitmap RGBA de jimp a WebP con node-webpmux (WASM) */
async function encodeWebp(bitmap, quality) {
  await ensureLib()
  const img = await Image.getEmptyImage()
  const res = await img.setImageData(bitmap.data, {
    width: bitmap.width,
    height: bitmap.height,
    quality,
    exact: true // conserva la transparencia exacta (no mezcla el alfa)
  })
  if (res) throw new Error(`No se pudo codificar el WebP (código ${res})`)
  return await img.save(null)
}

/**
 * Convierte una imagen (buffer jpg/png/webp) en WebP de 512×512:
 *   1. Reduce el lado más largo a 512 conservando el ancho × largo original
 *   2. Centra la foto en un lienzo 512×512 con relleno TRANSPARENTE
 *   3. Comprime ajustando la calidad para no superar ~95 KB (límite de WA)
 * El resultado visual es la foto con su forma exacta, y el archivo
 * cuadrado evita que WhatsApp lo estire.
 */
async function imageToWebp(buffer) {
  const src = await decodeToJimp(buffer)

  const scale = Math.min(SIZE / src.bitmap.width, SIZE / src.bitmap.height)
  const nw = Math.max(1, Math.round(src.bitmap.width * scale))
  const nh = Math.max(1, Math.round(src.bitmap.height * scale))

  const canvas = new Jimp({ width: SIZE, height: SIZE, color: 0x00000000 })
  if (scale !== 1) {
    src.resize({ w: nw, h: nh })
  }
  canvas.composite(src, Math.round((SIZE - nw) / 2), Math.round((SIZE - nh) / 2))

  // Calidad adaptativa: baja hasta que quepa en el límite de WhatsApp
  let webp = await encodeWebp(canvas.bitmap, 92)
  for (const q of [80, 65, 50]) {
    if (webp.length <= MAX_STATIC_BYTES) break
    webp = await encodeWebp(canvas.bitmap, q)
  }
  return webp
}

/**
 * Convierte una secuencia de frames (objetos Jimp o buffers de imagen
 * 512×512) en un WebP ANIMADO con loop infinito, 100% WASM con
 * node-webpmux. Comprime con calidad adaptativa para no superar ~450 KB.
 */
async function framesToAnimatedWebp(frames, fps = 12) {
  await ensureLib()
  // WA: delays <= 10 ms son "implementation defined"; 83 ms (12 fps) va bien
  const delay = Math.max(20, Math.round(1000 / fps))
  const qualities = [80, 65, 50]

  for (let i = 0; i < qualities.length; i++) {
    const animFrames = []
    for (const frame of frames) {
      const bitmap = frame?.bitmap ? frame.bitmap : (await decodeToJimp(frame)).bitmap
      const img = await Image.getEmptyImage()
      const res = await img.setImageData(bitmap.data, {
        width: bitmap.width,
        height: bitmap.height,
        quality: qualities[i],
        exact: true
      })
      if (res) throw new Error(`No se pudo codificar un frame (código ${res})`)
      animFrames.push(await Image.generateFrame({ img, delay }))
    }

    const webp = await Image.save(null, {
      frames: animFrames,
      width: SIZE,
      height: SIZE,
      delay,
      loops: 0 // loop infinito
    })
    if (webp.length <= MAX_ANIM_BYTES || i === qualities.length - 1) return webp
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
  const size = webpSize(sticker) || { width: SIZE, height: SIZE }
  return { sticker, width: size.width, height: size.height }
}

/**
 * Inyecta los metadatos EXIF (nombre del pack / autor) al WebP,
 * para que WhatsApp lo reconozca como sticker con pack propio.
 * Funciona tanto con WebP estático como animado (node-webpmux
 * conserva los frames al re-guardar).
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

module.exports = { toSticker, addExif, webpSize, framesToAnimatedWebp }
