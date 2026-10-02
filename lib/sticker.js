const sharp = require('sharp')
const crypto = require('crypto')
const { Image } = require('node-webpmux')

// WhatsApp recomienda stickers de hasta 512px por lado.
// El bot NO recorta ni deforma la foto: conserva su proporción
// (ancho × largo) exactamente igual a la original.
const MAX_SIDE = 512

/**
 * Convierte una imagen (buffer jpg/png/webp) en un sticker WebP,
 * conservando el ancho y el largo proporcionales de la foto original,
 * y le inyecta los metadatos EXIF del pack.
 */
async function toSticker(buffer, { pack = 'Sticker-WaBot', author = 'Sticker-Bot' } = {}) {
  // .rotate() respeta la orientación EXIF de la foto
  const img = sharp(buffer, { failOnError: false }).rotate()
  const meta = await img.metadata()
  const originalWidth = meta.width || 0
  const originalHeight = meta.height || 0

  // Solo se escala si supera el máximo de WhatsApp, siempre
  // manteniendo la misma proporción ancho/largo de la foto.
  if (Math.max(originalWidth, originalHeight) > MAX_SIDE) {
    img.resize(MAX_SIDE, MAX_SIDE, {
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  const { data } = await img
    .webp({ quality: 95 })
    .toBuffer({ resolveWithObject: true })

  const withExif = await addExif(data, { pack, author, emojis: ['✨'] })
  return withExif
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
