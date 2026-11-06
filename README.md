# Bingo/QR — control de jugadores

Aplicación web estática para armar partidas escaneando códigos QR numerados. Cada código contiene un número del **1 al 500**; al escanearlo se añade automáticamente el jugador **#número** a la partida.

## Qué incluye

- **Carpeta `codigos-qr/` con 500 códigos listos para escanear**:
  - `jugador-001.svg` … `jugador-500.svg` (ideales para imprimir).
  - `jugador-001.png` … `jugador-500.png` (290 × 390 px, listos para pantalla).
  - Cada archivo muestra su número en grande bajo el QR: `#1`, `#42`, `#500`…
  - `index.html` con todos los códigos y botón **Imprimir todos los códigos** (25 por página A4).
  - `codigos-qr-1-500.pdf` listo para imprimir: **20 páginas A4**, 25 códigos por página.
  - `LEEME.txt` con instrucciones.
- **Escaneo automático**: el QR `42` añade a `Jugador #42`. No hay que registrar jugadores antes.
- **Sin número fijo de jugadores**: escanea los que quieras y pulsa **Iniciar juego** cuando estés listo. Se exige al menos 1.
- **Cámara o entrada manual**: si la cámara no está disponible, escribe el número del jugador (1–500) y pulsa **Añadir**.
- **Detección de duplicados**: un jugador no puede escanearse dos veces en la misma partida.
- **Persistencia en `localStorage`**: jugadores, partida activa, historial y escaneo en curso sobreviven a una recarga.
- **Recuperación del escaneo**: si recargas a mitad del escaneo, aparece **Continuar escaneo**.
- **Móvil primero**: barra de acciones fija, botones táctiles grandes, campos de 16 px (sin zoom en iOS) y adaptación desde 320 px.

## Cómo ejecutarla

La cámara solo funciona en contextos seguros (`localhost` o HTTPS).

```bash
cd /home/jhon/code/bingo
python3 -m http.server 4173
```

Abre <http://localhost:4173>.

Para usarla desde el móvil en la misma red, sirve el proyecto por HTTPS (Caddy, ngrok, Cloudflare Tunnel o un hosting estático). Si abres `http://IP-LOCAL:4173`, verás el aviso **Cámara no disponible**; la entrada manual sigue funcionando.

## Flujo rápido

1. Abre o imprime los códigos de `codigos-qr/`. Cada uno lleva su número visible para poder repartirlo sin escanearlo.
2. En la app, pulsa **Iniciar nuevo juego** → **Escanear códigos QR**.
3. Escanea el QR del jugador. Aparecerá como `Jugador #N`.
4. Repite con todos los jugadores que quieras.
5. Pulsa **Iniciar juego**.
6. La pantalla principal muestra los jugadores activos. Puedes recargar: todo se recupera del `localStorage`.

## Imprimir en masa

Abre `codigos-qr/index.html` y pulsa **Imprimir todos los códigos**, o imprime directamente `codigos-qr/codigos-qr-1-500.pdf`. La hoja A4 se organiza en una cuadrícula de **5 × 5 (25 códigos por página)**, con el número impreso en grande debajo de cada QR. Los 500 códigos ocupan **20 páginas**.

Para imprimir códigos sueltos, abre directamente `jugador-XXX.svg` o `jugador-XXX.png`: el número ya forma parte de la imagen.

## Regenerar los 500 códigos

El generador usa el `vendor/qrcode.js` local, sin dependencias externas:

```bash
node scripts/generate-qr-codes.cjs
```

Vuelve a crear la carpeta `codigos-qr/` completa. Cada QR tiene como contenido únicamente su número (`"1"`, `"2"`, …, `"500"`), sin URL ni texto adicional. El número también se dibuja en grande bajo el QR dentro del propio SVG/PNG, de modo que se puede identificar sin escanear. Los nombres de archivo van con tres cifras (`jugador-001`), mientras que el contenido y la etiqueta visible son `1` y `#1`.

Para regenerar el PDF (requiere Playwright):

```bash
CHROMIUM_PATH=/ruta/a/chrome NODE_PATH=$(npm root -g) node scripts/generate-qr-pdf.cjs
```

## Detalles útiles

- Los números con ceros a la izquierda se normalizan: `0007` → jugador `#7`.
- Los códigos numéricos fuera de 1–500 se rechazan con un aviso.
- Puedes renombrar a cualquier jugador desde su ficha QR; el código numérico no cambia.
- La vista **Jugadores** permite además crear jugadores sueltos con códigos `BQ-XXXX-XX`, pero la colección principal es la numerada.
- **Finalizar partida** archiva la partida. Si empiezas otra con una activa, la anterior se archiva automáticamente.
- Imprimir un QR desde su ficha usa el mismo número que el código escaneado.

## Estructura

```
index.html                    Interfaz
styles.css                    Estilos y responsive
app.js                        Estado, escáner, QR y persistencia
scripts/generate-qr-codes.cjs Generador de los 500 QR
scripts/generate-qr-pdf.cjs   Generador opcional del PDF imprimible
codigos-qr/                   500 códigos SVG + PNG, índice, PDF y LEEME
vendor/jsQR.js                Lector de códigos QR
vendor/qrcode.js              Generador de códigos QR
vendor/fonts/                 Tipografías locales
```
