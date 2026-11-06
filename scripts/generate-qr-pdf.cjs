#!/usr/bin/env node
/**
 * Genera un PDF listo para imprimir con los 500 códigos (25 por página A4).
 *
 * Requiere Playwright instalado. Ejemplo:
 *   NODE_PATH=$(npm root -g) node scripts/generate-qr-pdf.cjs
 *
 * El PDF se guarda en codigos-qr/codigos-qr-1-500.pdf.
 * Ejecuta antes scripts/generate-qr-codes.cjs si quieres regenerar los QR.
 */

const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'codigos-qr', 'index.html');
const OUTPUT = path.join(ROOT, 'codigos-qr', 'codigos-qr-1-500.pdf');

(async () => {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage();
  await page.goto(pathToFileURL(INDEX).href, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
  await page.pdf({
    path: OUTPUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
  });
  await browser.close();
  console.log(`PDF generado en ${OUTPUT}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
