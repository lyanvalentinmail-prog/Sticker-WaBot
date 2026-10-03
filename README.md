# 🤖 Sticker-WaBot

Bot de WhatsApp con **un único comando**: convierte cualquier foto en **sticker conservando exactamente su ancho y largo** (sin recortes ni deformaciones).

Hecho con **[Baileys](https://github.com/WhiskeySockets/Baileys)** (WhatsApp Web API), con inicio de sesión por **código QR** o **código de vinculación (pairing code)**, y **servidor web integrado** para ver el estado del bot y mantenerlo vivo en hostings.

---

## ✨ Características

- 📸 `.sticker` y `.s` — convierte cualquier foto en sticker sin deformarla
- 🍏 `.brat <texto>` — sticker estilo **BRAT** (verde lima + tu texto en minúsculas)
- 🎬 `.bratv <texto>` — versión **animada (modo video)** del sticker BRAT
- 🖼️ Tu foto conserva su **proporción exacta** (nunca se estira): va centrada sobre un lienzo **512×512 transparente**, el formato que WhatsApp exige para los stickers
- 🔗 Inicio de sesión por **QR** o **código de 8 dígitos**
- 🌐 **Servidor web** con panel de estado (muestra el QR en el navegador)
- 🔁 Reconexión automática si se cae el internet
- 📱 Funciona respondiendo a una foto o enviando la foto con el comando
- ⏳ Reacciona con ⏳ mientras procesa y ✅ cuando termina

---

## 📲 Cómo se usa

| Forma | Descripción |
|---|---|
| **Opción 1** | Envía una **foto** y escribe como texto (caption) `.s` o `.sticker` |
| **Opción 2** | **Responde** a una foto ya enviada con `.s` o `.sticker` |

El bot te devuelve un sticker con la foto en su **proporción original, sin estirar ni deformar**: la imagen queda centrada en un lienzo 512×512 transparente (WhatsApp exige stickers exactamente cuadrados; si el archivo no es cuadrado, el cliente lo estira). Los bordes transparentes son invisibles en el chat. Acepta fotos en JPG, PNG y WEBP.

---

## 📟 Instalación en Termux (paso a paso)

### 1️⃣ Instala Termux

Descárgalo desde **F-Droid** (recomendado, siempre actualizado):
👉 https://f-droid.org/packages/com.termux/

> ⚠️ La versión de Play Store está desactualizada, **no la uses**.

### 2️⃣ Actualiza los paquetes

Abre Termux y ejecuta:

```bash
pkg update && pkg upgrade -y
```

### 3️⃣ Instala Git, Node.js y FFmpeg

```bash
pkg install git nodejs ffmpeg -y
```

> 📌 **ffmpeg es obligatorio**: es el convertidor que transforma tu foto en sticker.
> Sin él el bot no podrá crear stickers.

### 4️⃣ Clona este repositorio

```bash
git clone -b arena/01a0fedf-sticker-wabot https://github.com/lyanvalentinmail-prog/Sticker-WaBot
cd Sticker-WaBot
```

> 📌 **Importante:** el código del bot está en la rama `arena/01a0fedf-sticker-wabot`.
> Si clonas sin `-b ...` descargarás la rama `main` (vacía) y `npm install` fallará con
> *"Could not read package.json"*. Cuando el código se fusione a `main` ya podrás clonar normal.

### 5️⃣ Instala las dependencias

```bash
npm install
```

> ✅ **Comprueba que tienes la versión correcta:** ejecuta
> ```bash
> grep sharp package.json
> ```
> Si **no muestra nada**, tu código está actualizado (el bot usa ffmpeg).
> Si muestra `"sharp": ...`, tu copia está vieja; actualízala con:
> ```bash
> git fetch origin
> git reset --hard origin/arena/01a0fedf-sticker-wabot
> ```

> 💡 **¿Ya habías clonado antes sin la rama?** No borres nada, solo cámbiate a la rama correcta:
> ```bash
> cd ~/Sticker-WaBot
> git fetch origin
> git checkout arena/01a0fedf-sticker-wabot
> npm install
> ```

> ℹ️ Avisos de npm **que puedes ignorar**: `1 high severity vulnerability`,
> `npm warn install-scripts ...` (ninguna dependencia necesita esos scripts)
> y `packages are looking for funding`. **No ejecutes** `npm audit fix --force` (rompe el bot).

### 6️⃣ Inicia el bot

```bash
npm start
```

La primera vez te preguntará cómo quieres vincular:

```
Elige cómo vincular el bot:

  [1] Código QR
  [2] Código de 8 dígitos (pairing code)
```

#### Opción [1] — Código QR
1. Aparecerá un QR en la terminal (y también en `http://localhost:3000`)
2. En WhatsApp: **Ajustes → Dispositivos vinculados → Vincular dispositivo**
3. Escanea el QR ✅

#### Opción [2] — Código de vinculación
1. Escribe tu número con código de país, sin `+` ni espacios (ej: `521234567890`)
2. El bot mostrará un código tipo `ABCD-1234`
3. En WhatsApp: **Ajustes → Dispositivos vinculados → Vincular dispositivo → Vincular con número de teléfono**
4. Escribe el código ✅

> 💡 La sesión se guarda en la carpeta `auth/`, así que solo vinculas **una vez**.

### 7️⃣ Evita que Android cierre el bot

Para que Termux no se duerma y el bot siga activo:

```bash
termux-wake-lock
```

y bloquea la app de Termux en las apps recientes de tu teléfono (candado 🔒).

---

## 🟢 Mantener el bot encendido 24/7

Mientras el bot corre, abre otra sesión de Termux (desliza desde la izquierda → *New session*) para usar la terminal sin apagar el bot.

Para **detener** el bot: `Ctrl + C`

Para **volver a iniciarlo**: `cd Sticker-WaBot && npm start`

Si quieres **cerrar sesión** y vincular otro número:

```bash
rm -rf auth
npm start
```

---

## 🌐 Servidor web del bot

El bot levanta automáticamente un servidor en el puerto **3000** (configurable con `PORT`):

- `http://localhost:3000` → Panel con el estado del bot, el QR para escanear desde el navegador y el tiempo activo
- `http://localhost:3000/health` → Estado en JSON (útil para *uptime monitors*)

```bash
# Cambiar el puerto (ejemplo: 8080)
PORT=8080 npm start
```

Esto también permite hostear el bot en paneles tipo **Render, Railway, Replit, etc.**, que necesitan un puerto HTTP abierto para mantener el proceso vivo.

---

## 📌 Comandos disponibles

| Comando | Qué hace |
|---|---|
| `.sticker` / `.s` | Convierte la foto (enviada o citada) en sticker conservando su forma |
| `.brat <texto>` | Sticker estilo **BRAT**: fondo verde lima `#8ACE00` con tu texto en minúsculas y el característico desenfoque |
| `.bratv <texto>` | **Modo video**: la misma estética BRAT pero como **sticker animado** (el texto vibra en bucle) |

💡 También puedes **responder** al mensaje de otra persona con `.brat` y el bot usará su texto.

Ejemplos:
```
.brat süper natural
.bratv holy brat summer
```

---

## ⚙️ Personalización

En `index.js` puedes cambiar el nombre del pack de stickers:

```js
const PACK_NAME = 'Sticker-WaBot'   // nombre del pack
const PACK_AUTHOR = 'Mi Bot'        // autor del pack
```

---

## 🧰 Requisitos

- **Node.js** 18 o superior (Termux instala la versión actual)
- **FFmpeg** (`pkg install ffmpeg` en Termux)
- Conexión a internet
- WhatsApp instalado en tu teléfono

> 💡 El bot usa **ffmpeg** (proceso del sistema) en vez de librerías nativas como `sharp`,
> porque `sharp` **no carga en Termux** (error *"Could not load the sharp module using the
> android-arm64 runtime"*). Con ffmpeg el proyecto es 100% JavaScript puro y funciona en
> Termux, servidores Linux y paneles de hosting sin compilar nada.

---

## ❓ Solución de problemas

| Problema | Solución |
|---|---|
| `npm error enoent Could not read package.json` | Estás en la rama `main` (vacía). Ejecuta `git fetch origin && git checkout arena/01a0fedf-sticker-wabot` dentro de la carpeta, o vuelve a clonar con `-b` (ver paso 4️⃣) |
| `Could not load the "sharp" module using the android-arm64 runtime` | Tu copia tiene el código viejo (el bot ya usa **ffmpeg**, no sharp). Fuerza la actualización así: `git fetch origin && git reset --hard origin/arena/01a0fedf-sticker-wabot && rm -rf node_modules && pkg install ffmpeg -y && npm install`. Para comprobar que ya estás al día ejecuta `grep sharp package.json` → **no debe mostrar nada** |
| `No se encontró "ffmpeg"` / `spawn ffmpeg ENOENT` | Instala ffmpeg: `pkg install ffmpeg -y` y reinicia el bot |
| El sticker se ve estirado (deformado a un cuadrado) | Ya está corregido: actualiza tu copia con `git pull origin arena/01a0fedf-sticker-wabot` y reinicia el bot. El archivo ahora es 512×512 con tu foto centrada y relleno transparente (WhatsApp exige stickers cuadrados y por eso lo estiraba) |
| El QR se cierra muy rápido | Escanea rápido; si se vence, se genera otro solo |
| "Sesión cerrada" al iniciar | Borra la carpeta `auth` y vuelve a vincular: `rm -rf auth && npm start` |
| El bot no responde | Revisa que el número vinculado tenga WhatsApp activo e internet estable |
| No aparece el menú de opciones | Fuerza un método: `npm run qr` o `npm run pair` |

---

## 📂 Estructura del proyecto

```
Sticker-WaBot/
├── index.js        → Bot principal (conexión, comandos)
├── server.js       → Servidor web con panel de estado
├── lib/
│   ├── sticker.js  → Conversión de foto a sticker con ffmpeg (sin deformar) + WebP animado + metadatos
│   └── brat.js     → Generador de stickers estilo BRAT (estáticos y animados)
├── auth/           → Sesión de WhatsApp (se crea solo, NO borrar si quieres seguir vinculado)
└── package.json
```

---

## ⚖️ Aviso

Este proyecto es educativo. Usar bots no oficiales en WhatsApp puede causar el baneo de tu número según los términos de servicio de WhatsApp. Úsalo bajo tu propia responsabilidad, preferiblemente con un número secundario.
