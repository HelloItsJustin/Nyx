// Key collection flow - chat-style and validates every supplied key live.
// Credentials are intentionally collected fresh for every Nyx session.

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { renderNyxGlyph, renderUserMarker } from './glyph.js';
import { validateGithubToken } from './githubToken.js';

// Nyx says something
function nyxSay(msg, state = 'idle') {
  const mini = renderNyxGlyph('mini', state);
  console.log('  ' + mini + '  ' + chalk.hex('#EFEFEF')(msg));
}

// Nyx success
function nyxSuccess(msg) {
  const mini = renderNyxGlyph('mini', 'active');
  console.log('  ' + mini + '  ' + chalk.hex('#2ECC71')(msg));
}

// Nyx error
function nyxError(msg) {
  const mini = renderNyxGlyph('mini', 'idle');
  console.log('  ' + mini + '  ' + chalk.hex('#FF6B6B')(msg));
}

// Validate Gemini key
async function validateGemini(key) {
  try {
    const { default: fetch } = await import('node-fetch');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.status === 400 || res.status === 403) return { ok: false, reason: 'Invalid API key' };
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: body.error?.message || `API error: ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    if (e.name === 'TimeoutError') return { ok: false, reason: 'Request timed out' };
    return { ok: false, reason: `Network error: ${e.message}` };
  }
}

// Validate Groq key
async function validateGroq(key) {
  try {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 401) return { ok: false, reason: 'Invalid API key' };
    if (!res.ok) return { ok: false, reason: `API error: ${res.status}` };
    return { ok: true };
  } catch (e) {
    if (e.name === 'TimeoutError') return { ok: false, reason: 'Request timed out' };
    return { ok: false, reason: `Network error: ${e.message}` };
  }
}

// Validate TruffleHog binary
async function validateTrufflehog(binPath) {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileP = promisify(execFile);
  try {
    const { stdout } = await execFileP(binPath, ['--version'], { timeout: 5000 });
    if (stdout.toLowerCase().includes('trufflehog') || stdout.match(/\d+\.\d+/)) {
      return { ok: true };
    }
    return { ok: false, reason: 'Binary does not appear to be TruffleHog' };
  } catch (e) {
    return { ok: false, reason: `Could not run binary: ${e.message}` };
  }
}

// Prompt for a single key with validation
async function promptKey({ name, envKey, description, link, validator, isPassword = true, successMessage }) {
  console.log('');
  nyxSay(description);
  if (link) nyxSay(chalk.hex('#6B6B6B')('Get it at: ') + chalk.hex('#3AC7D9').underline(link));
  console.log('');

  while (true) {
    const marker = renderUserMarker();
    const { value } = await inquirer.prompt([{
      type: isPassword ? 'password' : 'input',
      name: 'value',
      message: marker + chalk.hex('#EFEFEF')(name + ': '),
      mask: isPassword ? '*' : undefined,
      validate: (v) => v && v.trim().length > 0 ? true : 'This field is required'
    }]);

    const val = value.trim();
    const spinner = ora({
      text: chalk.hex('#6C5CE7')('Validating...'),
      spinner: 'dots',
      color: 'magenta'
    }).start();

    const result = await validator(val);
    
    if (result.ok) {
      const detail = result.user ? ` (${result.user})` : '';
      spinner.stop();
      nyxSuccess(successMessage ? successMessage(result) : 'Verified' + detail);
      return val;
    } else {
      spinner.stop();
      nyxError('Failed: ' + result.reason + '. Please try again.');
    }
  }
}

export async function runKeyCollection() {
  const keys = {};

  // --- GITHUB TOKEN ---
  // TODO(oauth): Device Flow is a valid future improvement. It was deferred because
  // registering/configuring a GitHub OAuth App client ID was not possible before the deadline.
  keys.GITHUB_ACCESS_TOKEN = await promptKey({
    name: 'GitHub Personal Access Token',
    description: "Paste your GitHub personal access token. This stays on your machine only — Nyx never transmits it anywhere except directly to GitHub's own API. Create one at github.com/settings/tokens with 'repo' scope.",
    link: 'github.com/settings/tokens',
    validator: validateGithubToken,
    isPassword: true,
    successMessage: (result) => `Connected as ${result.user}`,
  });
  const github = await validateGithubToken(keys.GITHUB_ACCESS_TOKEN);
  if (!github.ok) throw new Error(github.reason);
  keys.GITHUB_LOGIN = github.login;
  keys.GITHUB_SCOPES = github.scopes;

  // --- GEMINI API KEY ---
  keys.GOOGLE_GEMINI_API_KEY = await promptKey({
    name: 'Gemini API Key',
    envKey: 'GOOGLE_GEMINI_API_KEY',
    description: "Gemini powers my reasoning. Free tier is plenty for a full scan.",
    link: 'aistudio.google.com/app/apikey',
    validator: validateGemini,
    isPassword: true
  });

  // --- GROQ API KEY ---
  keys.GROQ_API_KEY = await promptKey({
    name: 'Groq API Key',
    envKey: 'GROQ_API_KEY',
    description: "Groq is my fallback if Gemini hits a rate limit. Also free.",
    link: 'console.groq.com/keys',
    validator: validateGroq,
    isPassword: true
  });

  // --- TRUFFLEHOG BINARY ---
  // Check PATH first
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileP = promisify(execFile);
  
  let trufflehogPath = 'trufflehog';
  let thOk = false;

  try {
    const { stdout } = await execFileP(trufflehogPath, ['--version'], { timeout: 5000 });
    thOk = true;
  } catch {}

  if (!thOk) {
    console.log('');
    nyxSay("I need TruffleHog for secret detection. It's free and runs locally.");
    nyxSay(chalk.hex('#6B6B6B')('Install: github.com/trufflesecurity/trufflehog/releases'));

    while (true) {
      const marker = renderUserMarker();
      const { binPath } = await inquirer.prompt([{
        type: 'input',
        name: 'binPath',
        message: marker + chalk.hex('#EFEFEF')('TruffleHog binary path (or "trufflehog" if in PATH): '),
      }]);

      const val = (binPath || 'trufflehog').trim();
      const spinner = ora({ text: chalk.hex('#6C5CE7')('Checking...'), spinner: 'dots' }).start();
      const r = await validateTrufflehog(val);
      
      if (r.ok) {
        spinner.stop();
        nyxSuccess('TruffleHog confirmed');
        trufflehogPath = val;
        keys.TRUFFLEHOG_BINARY_PATH = val;
        break;
      } else {
        spinner.stop();
        nyxError('Not found: ' + r.reason);
      }
    }
  } else {
    keys.TRUFFLEHOG_BINARY_PATH = trufflehogPath;
    const mini = renderNyxGlyph('mini', 'active');
    console.log('  ' + mini + '  ' + chalk.hex('#2ECC71')('TruffleHog confirmed'));
  }

  // --- OPTIONAL KEYS ---
  console.log('');
  nyxSay(chalk.hex('#6B6B6B')("Optional: CanaryTokens API key (press Enter to skip)"));
  const { canary } = await inquirer.prompt([{
    type: 'password',
    name: 'canary',
    message: renderUserMarker() + chalk.hex('#6B6B6B')('CanaryTokens key (optional): '),
    mask: '*'
  }]);
  if (canary && canary.trim()) keys.CANARYTOKENS_API_KEY = canary.trim();

  return keys;
}
