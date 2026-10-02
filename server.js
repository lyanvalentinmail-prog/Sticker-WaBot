const express = require('express')
const QRCode = require('qrcode')

// Estado compartido del bot (se actualiza desde index.js)
const state = {
  status: 'iniciando',      // iniciando | esperando_qr | esperando_codigo | conectado | desconectado
  qr: null,                 // string del QR (si se usa login por QR)
  pairingCode: null,        // código de vinculación (si se usa ese método)
  user: null,               // número/nombre del bot conectado
  connectedAt: null,        // timestamp de la conexión
  startedAt: Date.now()
}

function setState(patch) {
  Object.assign(state, patch)
}

function uptime() {
  const s = Math.floor((Date.now() - (state.connectedAt || state.startedAt)) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m}m ${sec}s`
}

function startServer(port = process.env.PORT || 3000) {
  const app = express()

  app.get('/', async (req, res) => {
    let qrBlock = '<p style="opacity:.7">Sin código QR por ahora.</p>'
    if (state.qr) {
      try {
        const dataUrl = await QRCode.toDataURL(state.qr, { margin: 1, scale: 8 })
        qrBlock = `
          <div class="card">
            <h2>📱 Escanea este QR con WhatsApp</h2>
            <img src="${dataUrl}" alt="QR" style="width:260px;border-radius:12px;background:#fff;padding:10px"/>
            <p>WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular dispositivo</b></p>
          </div>`
      } catch {}
    }
    if (state.pairingCode) {
      qrBlock += `
        <div class="card">
          <h2>🔑 Código de vinculación</h2>
          <p class="code">${state.pairingCode}</p>
          <p>WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular con número de teléfono</b></p>
        </div>`
    }

    const statusEmoji = {
      iniciando: '⏳',
      esperando_qr: '📱',
      esperando_codigo: '🔑',
      conectado: '🟢',
      desconectado: '🔴'
    }[state.status] || '❔'

    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="15"/>
<title>Sticker-WaBot</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: system-ui, sans-serif; background:#0b141a; color:#e9edef; padding:20px; }
  .panel { width:100%; max-width:480px; background:#111b21; border:1px solid #1f2c33;
           border-radius:18px; padding:28px; text-align:center; }
  h1 { font-size:1.4rem; margin:0 0 6px; }
  .badge { display:inline-block; padding:6px 14px; border-radius:999px; background:#1f2c33;
           font-weight:600; margin:8px 0 4px; }
  .card { margin-top:18px; background:#1f2c33; border-radius:14px; padding:18px; }
  .code { font-size:2rem; letter-spacing:4px; font-weight:800; color:#00a884; margin:6px 0; }
  .meta { margin-top:16px; font-size:.9rem; opacity:.75; line-height:1.7; }
  .cmd { background:#0b141a; padding:2px 8px; border-radius:6px; font-family:monospace; color:#00a884; }
</style>
</head>
<body>
  <div class="panel">
    <h1>🤖 Sticker-WaBot</h1>
    <div class="badge">${statusEmoji} ${state.status.replace(/_/g, ' ')}</div>
    ${qrBlock}
    <div class="meta">
      ${state.user ? `👤 Conectado como: <b>${state.user}</b><br/>` : ''}
      ⏱️ Tiempo activo: <b>${uptime()}</b><br/>
      Comando: <span class="cmd">.sticker</span> o <span class="cmd">.s</span> sobre una foto<br/>
      <span style="opacity:.6">La página se actualiza sola cada 15&nbsp;s</span>
    </div>
  </div>
</body>
</html>`)
  })

  app.get('/health', (req, res) => {
    res.json({ ok: true, status: state.status, user: state.user, uptime: uptime() })
  })

  app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Servidor web listo en http://localhost:${port}`)
  })
}

module.exports = { startServer, setState }
