#!/usr/bin/env node
// Nyx CLI - Entry Point
// All runs are local. Your keys never leave your machine.

import chalk from 'chalk';
import gradient from 'gradient-string';
import boxen from 'boxen';
import ora from 'ora';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { renderNyxGlyph, renderUserMarker, startBreathing, stopBreathing } from './glyph.js';
import { runKeyCollection } from './keyCollection.js';
import { launchBackend, waitForHealth, getPort } from './backend.js';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Detect truecolor support
const hasTrueColor = process.env.COLORTERM === 'truecolor' || 
                     process.env.COLORTERM === '24bit' ||
                     process.env.TERM_PROGRAM === 'vscode' ||
                     (process.env.TERM && process.env.TERM.includes('256color')) ||
                     process.platform === 'win32'; // Windows Terminal supports truecolor

export { hasTrueColor };

function clearScreen() {
  process.stdout.write('\x1Bc');
}

function printWelcome() {
  clearScreen();

  // Nyx glyph centered
  const glyph = renderNyxGlyph('idle');
  const glyphLines = glyph.split('\n');
  const termWidth = process.stdout.columns || 80;
  
  glyphLines.forEach(line => {
    const stripped = line.replace(/\x1B\[[0-9;]*m/g, '');
    const pad = Math.max(0, Math.floor((termWidth - stripped.length) / 2));
    console.log(' '.repeat(pad) + line);
  });

  console.log('');

  // Title
  const title = hasTrueColor
    ? gradient(['#F3E9FF', '#8B6FE8', '#5B3FBF'])('NYX  v2.0')
    : chalk.magenta('NYX  v2.0');

  const titleWidth = 'NYX  v2.0'.length;
  const titlePad = Math.max(0, Math.floor((termWidth - titleWidth) / 2));
  console.log(' '.repeat(titlePad) + title);
  console.log('');

  // Trust statement - the core differentiator
  const trustLine = chalk.hex('#6B6B6B')('Everything runs on your machine. Your keys, your data, zero Nyx servers.');
  const trustStripped = trustLine.replace(/\x1B\[[0-9;]*m/g, '');
  const trustPad = Math.max(0, Math.floor((termWidth - trustStripped.length) / 2));
  console.log(' '.repeat(trustPad) + trustLine);
  console.log('');

  const divider = chalk.hex('#3A3A3A')('-'.repeat(Math.min(termWidth, 60)));
  const divPad = Math.max(0, Math.floor((termWidth - Math.min(termWidth, 60)) / 2));
  console.log(' '.repeat(divPad) + divider);
  console.log('');
}

async function printNyxMessage(msg, state = 'idle') {
  const glyph = renderNyxGlyph(state);
  const glyphLines = glyph.split('\n');
  const glyphHeight = glyphLines.length;

  // We show a small inline glyph (mini, 3-line version) for chat messages
  const mini = renderNyxGlyph('mini', state);
  console.log('');
  console.log(mini + '  ' + chalk.hex('#EFEFEF')(msg));
  console.log('');
}

async function main() {
  printWelcome();

  // Chat-style intro message
  const mini = renderNyxGlyph('mini', 'idle');
  console.log(mini + '  ' + chalk.hex('#EFEFEF')('Ready to scan your codebase for exposed credentials.'));
  console.log(mini + '  ' + chalk.hex('#6B6B6B')('I need a few API keys - all yours, none stored on any Nyx server.'));
  console.log('');

  // Run key collection flow
  const keys = await runKeyCollection();

  // All keys validated - show summary
  console.log('');
  const summaryBox = boxen(
    chalk.hex('#2ECC71').bold('  All set  ') + '\n\n' +
    chalk.hex('#EFEFEF')('  Primary LLM  : ') + chalk.hex('#6C5CE7')('Gemini (gemini-2.0-flash-exp)') + '\n' +
    chalk.hex('#EFEFEF')('  Fallback LLM : ') + chalk.hex('#F5A623')('Groq (auto-selected at runtime)') + '\n' +
    chalk.hex('#EFEFEF')('  TruffleHog   : ') + chalk.hex('#3AC7D9')(keys.TRUFFLEHOG_BINARY_PATH || 'system PATH') + '\n' +
    chalk.hex('#EFEFEF')('  GitHub       : ') + chalk.hex('#2ECC71')(`@${keys.GITHUB_LOGIN} connected`),
    {
      padding: 1,
      margin: { left: 2 },
      borderStyle: 'round',
      borderColor: '#2ECC71',
      backgroundColor: '#0D0D0D'
    }
  );
  console.log(summaryBox);
  console.log('');

  // Launch backend
  const spinner = ora({
    text: chalk.hex('#8B6FE8')('Starting local backend...'),
    spinner: 'dots',
    color: 'magenta'
  }).start();

  let port;
  let backendProc;
  try {
    backendProc = await launchBackend(keys);
    port = getPort();
    await waitForHealth(port);
    spinner.succeed(chalk.hex('#2ECC71')('Backend running on http://127.0.0.1:' + port));
  } catch (err) {
    spinner.fail(chalk.hex('#FF6B6B')('Backend failed to start: ' + err.message));
    process.exit(1);
  }

  // Open browser
  const dashURL = `http://127.0.0.1:${port}`;
  const openSpinner = ora({
    text: chalk.hex('#3AC7D9')('Opening dashboard in your browser...'),
    spinner: 'dots'
  }).start();
  
  try {
    await open(dashURL);
    openSpinner.succeed(chalk.hex('#3AC7D9')('Dashboard open: ' + dashURL));
  } catch {
    openSpinner.warn(chalk.hex('#F5A623')('Could not open browser automatically. Visit: ' + dashURL));
  }

  console.log('');
  console.log(chalk.hex('#6B6B6B')('  Press Ctrl+C to shut down Nyx cleanly.'));
  console.log('');

  // Live status view - stream backend events
  console.log(chalk.hex('#3A3A3A')('  ' + '-'.repeat(54)));
  console.log(chalk.hex('#6B6B6B')('  LIVE STATUS'));
  console.log(chalk.hex('#3A3A3A')('  ' + '-'.repeat(54)));

  // The breathing effect during idle
  const breathInterval = startBreathing();

  // Clean shutdown
  const shutdown = () => {
    stopBreathing(breathInterval);
    console.log('');
    console.log(chalk.hex('#6B6B6B')('\n  Shutting down Nyx...'));
    if (backendProc) {
      try {
        process.kill(-backendProc.pid);
      } catch {
        try { backendProc.kill('SIGTERM'); } catch {}
      }
    }
    console.log(chalk.hex('#2ECC71')('  Done. All processes stopped.'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive - print backend events via polling
  const statusInterval = setInterval(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.event) {
          const mini = renderNyxGlyph('mini', 'active');
          const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
          console.log(`  ${chalk.hex('#3A3A3A')(ts)}  ${mini}  ${chalk.hex('#EFEFEF')(data.event)}`);
        }
      }
    } catch {}
  }, 2000);

  // Keep process alive
  await new Promise(() => {});
}

main().catch(err => {
  console.error(chalk.red('Fatal error: ' + err.message));
  process.exit(1);
});
