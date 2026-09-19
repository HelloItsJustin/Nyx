// Nyx Glyph Renderer
// Renders a compact 5-line diamond that serves as Nyx's visual identity in the terminal.
// Tight design: readable at any terminal width, still carries the violet gradient identity.

import chalk from 'chalk';
import { hasTrueColor } from './index.js';

// Color palettes
const COLORS = {
  // Truecolor gradient
  TC: {
    idle: {
      glow:    '#3B1D8A',
      outer:   '#5B3FBF',
      mid:     '#8B6FE8',
      light:   '#C4A8F8',
      bright:  '#F3E9FF',
      center:  '#FFFFFF',
      pink:    '#F0C0E8',
    },
    active: {
      glow:    '#4A28A8',
      outer:   '#6C5CE7',
      mid:     '#9D85F0',
      light:   '#D4BAFF',
      bright:  '#FFFFFF',
      center:  '#FFFFFF',
      pink:    '#F8D0F4',
    },
    mini: {
      outer:   '#5B3FBF',
      mid:     '#8B6FE8',
      bright:  '#F3E9FF',
    }
  },
  // 16-color fallback
  ANSI: {
    glyph: 'magenta',
    bright: 'white',
  }
};

let breathPhase = 0;

// Full glyph - compact 5-line diamond, clean and legible
function buildFullGlyph(state) {
  if (!hasTrueColor) return buildFallbackGlyph();

  const c = state === 'active' ? COLORS.TC.active : COLORS.TC.idle;
  const B = (hex, ch) => chalk.hex(hex)(ch);

  // 5-row compact diamond: top point, upper facets, widest center, lower facets, bottom point
  const rows = [
    `       ${B(c.light,'▲')}       `,
    `     ${B(c.outer,'◢')}${B(c.mid,'█')}${B(c.bright,'█')}${B(c.mid,'█')}${B(c.outer,'◣')}     `,
    `   ${B(c.outer,'◢')}${B(c.mid,'█')}${B(c.light,'█')}${B(c.bright,'█')}${B(c.center,'◆')}${B(c.bright,'█')}${B(c.light,'█')}${B(c.mid,'█')}${B(c.outer,'◣')}   `,
    `     ${B(c.outer,'◥')}${B(c.mid,'█')}${B(c.bright,'█')}${B(c.mid,'█')}${B(c.outer,'◤')}     `,
    `       ${B(c.light,'▼')}       `,
  ];

  return rows.join('\n');
}

// Mini inline glyph - single line, used next to chat messages
function buildMiniGlyph(state) {
  if (!hasTrueColor) return chalk.magenta('◆ ');
  const c = state === 'active' ? COLORS.TC.active : COLORS.TC.mini;
  const B = (hex, ch) => chalk.hex(hex)(ch);
  // A clean single diamond: ◈ flanked by subtle dots
  return B(c.outer,'·') + B(c.mid,'◆') + B(c.outer,'·');
}

// Fallback 16-color glyph
function buildFallbackGlyph() {
  const m = chalk.magenta;
  const w = chalk.white;
  const rows = [
    '    ' + m('▲') + '    ',
    '  ' + m('◢') + w('███') + m('◣') + '  ',
    m('◢') + w('███') + m('◆') + w('███') + m('◣'),
    '  ' + m('◥') + w('███') + m('◤') + '  ',
    '    ' + m('▼') + '    ',
  ];
  return rows.join('\n');
}

// Render glyph by mode
export function renderNyxGlyph(mode = 'full', state = 'idle') {
  if (mode === 'mini') return buildMiniGlyph(state);
  return buildFullGlyph(state);
}

// User side marker - minimal gray chevron
export function renderUserMarker() {
  if (!hasTrueColor) return chalk.gray('> ');
  return chalk.hex('#6B6B6B')('> ');
}

// Breathing effect - alternates shade every 800ms
let _breathInterval = null;
let _breathState = 0;

export function startBreathing() {
  _breathInterval = setInterval(() => {
    _breathState = 1 - _breathState;
    // Just a subtle cursor blink-like indicator
    process.stdout.write('\r  ' + (hasTrueColor 
      ? chalk.hex(_breathState ? '#8B6FE8' : '#5B3FBF')('*') 
      : chalk.magenta('*')) + ' ');
  }, 800);
  return _breathInterval;
}

export function stopBreathing(interval) {
  if (interval) clearInterval(interval);
  process.stdout.write('\r   \r');
}
