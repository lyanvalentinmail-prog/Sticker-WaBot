const { Jimp, loadFont, JimpMime, HorizontalAlign, VerticalAlign } = require('jimp')
const { measureTextHeight } = require('@jimp/plugin-print')
const fonts = require('@jimp/plugin-print/fonts')

// ──────────────────────────────────────────────
//  Generador de stickers estilo "BRAT"
//  (verde lima #8ACE00 + texto negro en minúsculas
//  con el característico leve desenfoque)
//  100% JavaScript puro (jimp) — sin librerías nativas.
// ──────────────────────────────────────────────

const SIZE = 512
const BG = 0x8ace00ff            // verde brat
const MARGIN = 40
const TEXT_WIDTH = SIZE - MARGIN * 2

/** Elige el tamaño de fuente según lo largo del texto */
function pickFont(text) {
  const len = text.length
  if (len <= 4) return fonts.SANS_128_BLACK
  if (len <= 14) return fonts.SANS_64_BLACK
  if (len <= 60) return fonts.SANS_32_BLACK
  return fonts.SANS_16_BLACK
}

/** Limpia/prepara el texto */
function cleanText(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 90)
}

/**
 * Renderiza el texto (minúsculas, centrado, pseudo-negrita y
 * ligero blur al estilo brat) sobre una capa transparente 512×512.
 * La capa se reutiliza en todos los frames de la animación.
 */
async function renderTextLayer(text) {
  const layer = new Jimp({ width: SIZE, height: SIZE, color: 0x00000000 })
  const font = await loadFont(pickFont(text))
  const h = measureTextHeight(font, text, TEXT_WIDTH)
  const y = Math.max(0, Math.round((SIZE - h) / 2))

  const print = (dx, dy) =>
    layer.print({
      font,
      x: MARGIN + dx,
      y: y + dy,
      text: { text, alignmentX: HorizontalAlign.CENTER, alignmentY: VerticalAlign.TOP },
      maxWidth: TEXT_WIDTH,
      maxHeight: SIZE - y
    })

  // Doble impresión con desfase → efecto negrita...
  print(0, 0)
  print(2, 1)
  // ...y el desenfoque característico de "brat"
  layer.blur(2)
  return layer
}

/** Pequeño jitter aleatorio para la animación (efecto glitch) */
function jitter(max) {
  return Math.round((Math.random() * 2 - 1) * max)
}

/** ── MODO ESTÁTICO: una sola imagen PNG 512×512 ── */
async function makeBratImage(text) {
  text = cleanText(text)
  if (!text) throw new Error('Texto vacío')

  const img = new Jimp({ width: SIZE, height: SIZE, color: BG })
  const layer = await renderTextLayer(text)
  img.composite(layer, 0, 0)
  return img.getBuffer(JimpMime.png)
}

/** ── MODO VIDEO: N frames PNG con el texto vibrando ── */
async function makeBratFrames(text, frameCount = 10) {
  text = cleanText(text)
  if (!text) throw new Error('Texto vacío')

  const layer = await renderTextLayer(text) // se calcula solo una vez
  const frames = []
  for (let i = 0; i < frameCount; i++) {
    const frame = new Jimp({ width: SIZE, height: SIZE, color: BG })
    frame.composite(layer, jitter(3), jitter(3)) // vibración
    frames.push(await frame.getBuffer(JimpMime.png))
  }
  return frames
}

module.exports = { makeBratImage, makeBratFrames, BRAT_BG: '#8ace00' }
