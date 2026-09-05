#!/usr/bin/env node
/**
 * Generates app icon, splash screen, adaptive icon (Android) and web favicon.
 * Run once after install:  node scripts/generate-assets.js
 *
 * Outputs
 *   assets/icon.png          1024×1024  — iOS + general app icon
 *   assets/adaptive-icon.png 1024×1024  — Android adaptive icon foreground
 *   assets/splash.png        1284×2778  — Expo splash screen (portrait)
 *   assets/favicon.png         64×64    — Web browser tab
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const OUT = path.resolve(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

// ─── Colour palette ───────────────────────────────────────────────────────────

const BG      = '#0B0E13';   // ink — app background
const BADGE   = '#161B23';   // raised surface behind the splash mark
const WHITE   = '#FFFFFF';
const SURFACE = '#E8EAEE';   // off-white lower panel
const ACCENT  = '#FFB224';   // amber — windows, destination banner
const WHEEL   = '#2A303B';   // tyre
const HUB     = '#6E7A8A';   // hub cap
const AMBER   = '#FFD60A';   // headlights
const DOOR    = '#AEB6C2';   // door lines
const TEXT    = '#F4F6F8';
const MUTED   = '#98A2B0';

// ─── Bus SVG helper ───────────────────────────────────────────────────────────
// Returns an SVG <g> with the bus centred at (cx, cy) scaled to busW × busH.
// bgColor must match whatever sits behind the bus — the wheel cutouts are
// painted with it to fake a notch in the body.

function busGroup(cx, cy, busW, busH, bgColor = BG) {
  // All coordinates are relative to a 1×1 unit bus, then scaled.
  // Bus box: x=0..1, y=0..1, but we'll work in pixels directly.
  const x0 = cx - busW / 2;
  const y0 = cy - busH / 2;
  const rx  = busH * 0.13;

  // Windows: 4 panes across the top 30% of body
  const winY = y0 + busH * 0.10;
  const winH = busH * 0.28;
  const winR = busH * 0.05;
  const innerW = busW * 0.88;
  const nWins  = 4;
  const winW   = (innerW - (nWins - 1) * busW * 0.015) / nWins;
  const winGap = busW * 0.015;
  const winX0  = x0 + (busW - innerW) / 2;

  const wins = Array.from({ length: nWins }, (_, i) => {
    const wx  = p(winX0 + i * (winW + winGap));
    const op  = i === nWins - 1 ? ' opacity="0.32"' : '';
    return `<rect x="${wx}" y="${p(winY)}" width="${p(winW)}" height="${p(winH)}" rx="${p(winR)}" fill="${ACCENT}"${op}/>`;
  }).join('\n  ');

  // Destination banner
  const banY = y0 + busH * 0.39;
  const banH = busH * 0.14;

  // Lower body
  const lowY = banY + banH;
  const lowH = (y0 + busH) - lowY;

  // Headlights
  const hlY = lowY + lowH * 0.55;
  const hlH = busH * 0.08;
  const hlW = busW * 0.10;

  // Door decoration
  const dX1 = x0 + busW * 0.72;
  const dX2 = x0 + busW * 0.82;
  const dY1 = lowY + busH * 0.03;
  const dY2 = y0 + busH * 0.93;
  const dMY = (dY1 + dY2) / 2;

  // Wheels
  const wR    = busH * 0.175;
  const wCY   = y0 + busH + wR * 0.02;
  const wCX1  = x0 + busW * 0.248;
  const wCX2  = x0 + busW * 0.752;
  const wBg   = bgColor;

  return `
  <!-- Bus body -->
  <rect x="${p(x0)}" y="${p(y0)}" width="${p(busW)}" height="${p(busH)}" rx="${p(rx)}" fill="${WHITE}"/>
  <!-- Windows -->
  ${wins}
  <!-- Destination banner -->
  <rect x="${p(x0)}" y="${p(banY)}" width="${p(busW)}" height="${p(banH)}" fill="${ACCENT}"/>
  <!-- Lower panel -->
  <rect x="${p(x0)}" y="${p(lowY)}" width="${p(busW)}" height="${p(lowH)}" rx="0 0 ${p(rx)} ${p(rx)}" fill="${SURFACE}"/>
  <!-- Headlights -->
  <rect x="${p(x0 + busW * 0.03)}" y="${p(hlY)}" width="${p(hlW)}" height="${p(hlH)}" rx="${p(hlH / 2)}" fill="${AMBER}" opacity="0.88"/>
  <rect x="${p(x0 + busW - busW * 0.03 - hlW)}" y="${p(hlY)}" width="${p(hlW)}" height="${p(hlH)}" rx="${p(hlH / 2)}" fill="${AMBER}" opacity="0.88"/>
  <!-- Door -->
  <line x1="${p(dX1)}" y1="${p(dY1)}" x2="${p(dX1)}" y2="${p(dY2)}" stroke="${DOOR}" stroke-width="${p(busW * 0.005)}" stroke-linecap="round"/>
  <line x1="${p(dX2)}" y1="${p(dY1)}" x2="${p(dX2)}" y2="${p(dY2)}" stroke="${DOOR}" stroke-width="${p(busW * 0.005)}" stroke-linecap="round"/>
  <line x1="${p(dX1)}" y1="${p(dMY)}" x2="${p(dX2)}" y2="${p(dMY)}" stroke="${DOOR}" stroke-width="${p(busW * 0.005)}" stroke-linecap="round"/>
  <!-- Wheel cutouts -->
  <rect x="${p(wCX1 - wR)}" y="${p(y0 + busH - busH * 0.04)}" width="${p(wR * 2)}" height="${p(busH * 0.1)}" fill="${wBg}"/>
  <rect x="${p(wCX2 - wR)}" y="${p(y0 + busH - busH * 0.04)}" width="${p(wR * 2)}" height="${p(busH * 0.1)}" fill="${wBg}"/>
  <!-- Wheels -->
  <circle cx="${p(wCX1)}" cy="${p(wCY)}" r="${p(wR)}" fill="${wBg}"/>
  <circle cx="${p(wCX1)}" cy="${p(wCY)}" r="${p(wR * 0.68)}" fill="${WHEEL}"/>
  <circle cx="${p(wCX1)}" cy="${p(wCY)}" r="${p(wR * 0.30)}" fill="${HUB}"/>
  <circle cx="${p(wCX2)}" cy="${p(wCY)}" r="${p(wR)}" fill="${wBg}"/>
  <circle cx="${p(wCX2)}" cy="${p(wCY)}" r="${p(wR * 0.68)}" fill="${WHEEL}"/>
  <circle cx="${p(wCX2)}" cy="${p(wCY)}" r="${p(wR * 0.30)}" fill="${HUB}"/>`;
}

// Round to one decimal place
function p(n) { return Math.round(n * 10) / 10; }

// ─── Icon SVG (1024 × 1024) — dark background ─────────────────────────────

function iconSvg(size = 1024) {
  const busW = size * 0.72;
  const busH = size * 0.38;
  const cx   = size / 2;
  const cy   = size * 0.47;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  ${busGroup(cx, cy, busW, busH, BG)}
</svg>`;
}

// ─── Adaptive icon SVG (1024 × 1024) — transparent bg ─────────────────────
// Android crops to a circle/squircle; safe zone is the central 66%.

function adaptiveIconSvg(size = 1024) {
  const busW = size * 0.66;
  const busH = size * 0.35;
  const cx   = size / 2;
  const cy   = size * 0.47;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  ${busGroup(cx, cy, busW, busH, BG)}
</svg>`;
}

// ─── Splash SVG (1284 × 2778) — white background ───────────────────────────

function splashSvg() {
  const W = 1284, H = 2778;
  // Badge (dark rounded square) centred at (W/2, H*0.43)
  const badgeSize = 280;
  const badgeCX = W / 2;
  const badgeCY = H * 0.43;
  const bx = badgeCX - badgeSize / 2;
  const by = badgeCY - badgeSize / 2;
  const badgeRx = badgeSize * 0.22;

  // Bus inside badge
  const busW = badgeSize * 0.78;
  const busH = badgeSize * 0.37;
  const busCX = badgeCX;
  const busCY = badgeCY - badgeSize * 0.04;

  const textY  = badgeCY + badgeSize / 2 + 76;
  const subY   = textY + 54;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <!-- App icon badge -->
  <rect x="${p(bx)}" y="${p(by)}" width="${p(badgeSize)}" height="${p(badgeSize)}" rx="${p(badgeRx)}"
    fill="${BADGE}" stroke="${ACCENT}" stroke-opacity="0.28" stroke-width="2"/>
  ${busGroup(busCX, busCY, busW, busH, BADGE)}
  <!-- App name -->
  <text x="${W / 2}" y="${p(textY)}"
    text-anchor="middle"
    font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
    font-size="56" font-weight="700" fill="${TEXT}" letter-spacing="-1.2">Bus Navigator</text>
  <!-- Subtitle -->
  <text x="${W / 2}" y="${p(subY)}"
    text-anchor="middle"
    font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
    font-size="26" fill="${MUTED}" letter-spacing="0.2">Pan-India Transit Assistant</text>
</svg>`;
}

// ─── Favicon SVG (64 × 64) ────────────────────────────────────────────────

function faviconSvg(size = 64) {
  const rx = size * 0.18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${BG}"/>
  ${busGroup(size / 2, size * 0.46, size * 0.78, size * 0.38, BG)}
</svg>`;
}

// ─── Build ─────────────────────────────────────────────────────────────────

async function build(name, svgStr, width, height) {
  const outPath = path.join(OUT, name);
  await sharp(Buffer.from(svgStr))
    .resize(width, height)
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`✓  ${name}  (${width}×${height})`);
}

(async () => {
  console.log('\nGenerating assets…\n');
  try {
    await build('icon.png',          iconSvg(1024),         1024, 1024);
    await build('adaptive-icon.png', adaptiveIconSvg(1024), 1024, 1024);
    await build('splash.png',        splashSvg(),           1284, 2778);
    await build('favicon.png',       faviconSvg(256),         64,   64);
    console.log('\nAll assets written to ./assets/\n');
  } catch (err) {
    console.error('\nFailed:', err.message);
    console.error('Make sure sharp is installed: npm install\n');
    process.exit(1);
  }
})();
