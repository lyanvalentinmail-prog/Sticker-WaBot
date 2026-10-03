const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  getContentType,
  Browsers
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const readline = require('readline')
const qrcodeTerminal = require('qrcode-terminal')

const { toSticker, addExif, framesToAnimatedWebp } = require('./lib/sticker')
const { makeBratImage, makeBratFrames } = require('./lib/brat')
const { startServer, setState } = require('./server')

// ──────────────────────────────────────────────
//  CONFIGURACIÓN
// ──────────────────────────────────────────────
const PACK_NAME = 'Sticker-WaBot'
const PACK_AUTHOR = 'Mi Bot'
const PORT = process.env.PORT || 3000

const commands = ['s', 'sticker', 'brat', 'bratv'] // comandos disponibles

const logger = pino({ level: 'silent' })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function question(text) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(text, ans => { rl.close(); resolve(ans.trim()) }))
}

// ──────────────────────────────────────────────
//  ARRANQUE
// ──────────────────────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth')
  const { version } = await fetchLatestBaileysVersion()

  // Elegir método de inicio de sesión (solo si aún no hay sesión)
  let usePairingCode = process.argv.includes('--pair') || process.env.PAIRING === 'true'
  let phoneNumber = process.env.PHONE_NUMBER || ''

  if (process.argv.includes('--qr')) usePairingCode = false

  if (!state.creds.registered && process.stdin.isTTY && !process.argv.includes('--pair') && !process.argv.includes('--qr')) {
    console.log('\n╔════════════════════════════════════╗')
    console.log('║        🤖  STICKER-WABOT           ║')
    console.log('╚════════════════════════════════════╝\n')
    console.log('Elige cómo vincular el bot:\n')
    console.log('  [1] Código QR')
    console.log('  [2] Código de 8 dígitos (pairing code)\n')
    const opt = await question('Opción (1 o 2): ')
    usePairingCode = opt === '2'
  }

  if (usePairingCode && !state.creds.registered && !phoneNumber) {
    phoneNumber = await question('📞 Tu número con código de país, sin "+" ni espacios (ej: 521234567890): ')
  }
  phoneNumber = phoneNumber.replace(/\D/g, '')

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true
  })

  // ── Código de vinculación ──
  if (usePairingCode && !sock.authState.creds.registered) {
    try {
      await new Promise(r => setTimeout(r, 1500))
      const code = await sock.requestPairingCode(phoneNumber)
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code
      console.log('\n=========================================')
      console.log(`  🔑 CÓDIGO DE VINCULACIÓN: ${formatted}`)
      console.log('=========================================')
      console.log('  En WhatsApp ve a:')
      console.log('  Ajustes → Dispositivos vinculados →')
      console.log('  Vincular dispositivo → Vincular con')
      console.log('  número de teléfono\n')
      setState({ status: 'esperando_codigo', pairingCode: formatted, qr: null })
    } catch (err) {
      console.error('❌ Error pidiendo el código de vinculación:', err.message)
    }
  }

  sock.ev.on('creds.update', saveCreds)

  // ── Estado de la conexión + QR ──
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr && !usePairingCode) {
      console.log('\n📱 Escanea este QR con WhatsApp (Dispositivos vinculados):\n')
      qrcodeTerminal.generate(qr, { small: true })
      setState({ status: 'esperando_qr', qr, pairingCode: null })
    }

    if (connection === 'open') {
      const me = sock.user?.id?.split(':')[0] || 'desconocido'
      console.log(`\n✅ Bot conectado como ${me}`)
      console.log(`💡 Envía una foto con el texto  .s  o responde a una foto con  .sticker\n`)
      setState({ status: 'conectado', qr: null, pairingCode: null, user: me, connectedAt: Date.now() })
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      setState({ status: 'desconectado', qr: null, pairingCode: null })

      if (shouldReconnect) {
        console.log('🔄 Conexión perdida, reconectando en 5s...')
        sleep(5000).then(() => startBot())
      } else {
        console.log('❌ Sesión cerrada. Borra la carpeta "auth" y vuelve a vincular.')
        process.exit(0)
      }
    }
  })

  // ── Mensajes ──
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const m of messages) {
      try {
        await handleMessage(sock, m)
      } catch (err) {
        console.error('Error procesando mensaje:', err)
      }
    }
  })
}

// ──────────────────────────────────────────────
//  MANEJO DEL COMANDO .s / .sticker
// ──────────────────────────────────────────────
function unwrapContent(content) {
  let m = content
  for (const wrapper of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage']) {
    if (m?.[wrapper]) m = m[wrapper].message
  }
  return m
}

function getBody(m) {
  const msg = unwrapContent(m.message)
  return (
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    ''
  )
}

// ──────────────────────────────────────────────
//  COMANDOS .brat y .bratv (estilo BRAT)
// ──────────────────────────────────────────────
async function handleBrat(sock, m, from, cmd, text, react, reply) {
  // Si no hay texto, intentar usar el del mensaje citado
  if (!text) {
    const content = unwrapContent(m.message)
    const contextInfo = content?.[getContentType(content)]?.contextInfo
    if (contextInfo?.quotedMessage) {
      text = getBody({ message: contextInfo.quotedMessage }).trim()
    }
  }

  if (!text) {
    return reply(
      '✏️ *Sticker estilo BRAT*\n\n' +
      '• `.brat <texto>` → sticker blanco con tu texto\n' +
      '• `.bratv <texto>` → versión *video* (animada)\n\n' +
      '📌 Ejemplo: `.brat hola mundo`\n' +
      '💡 También puedes *responder* a un mensaje con `.brat`'
    )
  }

  const animated = cmd === 'bratv'

  try {
    await react('⏳')

    if (animated) {
      // 🎬 MODO VIDEO: secuencia de frames con vibración → WebP animado.
      // IMPORTANTE: NO declarar isAnimated a mano — sin firstFrameLength
      // y firstFrameSidecar WhatsApp descarta el sticker silenciosamente.
      // El WebP animado se detecta solo por su contenido.
      const frames = await makeBratFrames(text)
      const webp = await framesToAnimatedWebp(frames, 12)
      const sticker = await addExif(webp, { pack: PACK_NAME, author: PACK_AUTHOR, emojis: ['🍏'] })
      await sock.sendMessage(from, { sticker, width: 512, height: 512 }, { quoted: m })
    } else {
      // 🖼️ MODO ESTÁTICO: imagen PNG → WebP 512×512 con EXIF
      const png = await makeBratImage(text)
      const { sticker, width, height } = await toSticker(png, { pack: PACK_NAME, author: PACK_AUTHOR })
      await sock.sendMessage(from, { sticker, width, height }, { quoted: m })
    }

    await react('✅')
  } catch (err) {
    console.error('Error en comando brat:', err)
    await react('❌')
    if (/ffmpeg/i.test(err.message || '')) {
      reply('❌ No tengo *ffmpeg* instalado. En Termux ejecuta:\n`pkg install ffmpeg -y`\ny reinicia el bot.')
    } else {
      reply('❌ No pude crear el sticker brat. Inténtalo con un texto más corto.')
    }
  }
}

async function handleMessage(sock, m) {
  if (!m.message || !m.key?.remoteJid) return
  const from = m.key.remoteJid
  if (from === 'status@broadcast') return

  const body = getBody(m).trim()
  if (!body.startsWith('.')) return

  const args = body.slice(1).trim().split(/\s+/)
  const cmd = args[0].toLowerCase()
  if (!commands.includes(cmd)) return
  const text = args.slice(1).join(' ')

  const react = (emoji) =>
    sock.sendMessage(from, { react: { text: emoji, key: m.key } }).catch(() => {})

  const reply = (text) =>
    sock.sendMessage(from, { text }, { quoted: m })

  // ── Comandos de texto: .brat / .bratv ──
  if (cmd === 'brat' || cmd === 'bratv') {
    return handleBrat(sock, m, from, cmd, text, react, reply)
  }

  // Buscar la imagen: en el propio mensaje (foto enviada con el
  // comando como descripción) o en el mensaje citado (respondiendo).
  const content = unwrapContent(m.message)
  const type = getContentType(content)

  let messageWithImage = null

  if (type === 'imageMessage') {
    messageWithImage = m
  } else {
    const contextInfo = content?.[type]?.contextInfo
    const quoted = contextInfo?.quotedMessage && unwrapContent(contextInfo.quotedMessage)
    if (quoted && getContentType(quoted) === 'imageMessage') {
      messageWithImage = {
        key: {
          remoteJid: from,
          id: contextInfo.stanzaId,
          participant: contextInfo.participant
        },
        message: quoted
      }
    }
  }

  if (!messageWithImage) {
    return reply(
      '📸 *Cómo usar el bot:*\n\n' +
      '1️⃣ Envía una *foto* con el texto *.sticker* (o *.s*)\n' +
      '2️⃣ O *responde* a una foto con *.sticker*\n\n' +
      '✨ El sticker conserva el ancho y largo de tu foto.'
    )
  }

  try {
    await react('⏳')

    const buffer = await downloadMediaMessage(
      messageWithImage,
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    )

    // Sticker 512×512 con la foto en su proporción exacta y relleno
    // transparente (el archivo cuadrado evita que WhatsApp lo estire)
    const { sticker, width, height } = await toSticker(buffer, { pack: PACK_NAME, author: PACK_AUTHOR })

    await sock.sendMessage(from, { sticker, width, height }, { quoted: m })
    await react('✅')
  } catch (err) {
    console.error('Error creando sticker:', err)
    await react('❌')
    if (/ffmpeg/i.test(err.message || '')) {
      reply('❌ No tengo *ffmpeg* instalado. En Termux ejecuta:\n`pkg install ffmpeg -y`\ny reinicia el bot.')
    } else {
      reply('❌ No pude crear el sticker. Asegúrate de que sea una imagen (JPG, PNG o WEBP) e inténtalo de nuevo.')
    }
  }
}

// ──────────────────────────────────────────────
startServer(PORT)
startBot()
