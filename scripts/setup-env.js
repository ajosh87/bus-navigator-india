#!/usr/bin/env node
/**
 * One-shot environment setup: pipes secrets straight into `vercel env add`.
 *
 *   npm run setup
 *
 * Values are typed here and streamed to Vercel over stdin, so they never land
 * in shell history, never sit in a file, and never appear on screen. Nothing is
 * written to disk by this script.
 */

const { scryptSync, randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline');

// Must match api/auth/login.ts. The parameters are embedded in the hash, so
// changing them here stays compatible with already-issued hashes.
const N = 32768, r = 8, p = 1, KEYLEN = 32;

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN, { N, r, p, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/** Reads a line without echoing it, so nothing sensitive stays on screen. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stdout, terminal: true,
    });
    let muted = false;
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (chunk) => {
      if (muted) return;               // swallow the keystrokes entirely
      original(chunk);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); resolve(a); });
  });
}

/** Streams a value into `vercel env add NAME production` via stdin. */
function setEnv(name, value) {
  const res = spawnSync(
    'npx',
    ['vercel', 'env', 'add', name, 'production'],
    { input: `${value}\n`, encoding: 'utf8', shell: process.platform === 'win32' },
  );

  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;

  if (res.status === 0) {
    console.log(`  ✓ ${name}`);
    return true;
  }
  if (/already exists/i.test(output)) {
    console.log(`  ! ${name} already set — remove it first:`);
    console.log(`      npx vercel env rm ${name} production -y`);
    return false;
  }
  console.log(`  ✗ ${name} failed`);
  console.log(output.trim().split('\n').slice(-4).map((l) => `      ${l}`).join('\n'));
  return false;
}

function assess(pw) {
  const problems = [];
  if (pw.length < 12) problems.push('shorter than 12 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) problems.push('no mixed case');
  if (!/\d/.test(pw)) problems.push('no digits');
  return problems;
}

(async () => {
  console.log('\nBus Navigator — production environment setup');
  console.log('Values are streamed straight to Vercel. Nothing is echoed or saved locally.\n');

  const password = await askHidden('Choose an app sign-in password: ');
  if (!password) {
    console.error('No password entered. Nothing was changed.\n');
    process.exit(1);
  }

  const weak = assess(password);
  if (weak.length) {
    console.log(`\n⚠  Weak password: ${weak.join(', ')}.`);
    console.log('   scrypt makes guessing expensive, not impossible — length helps most.');
    const go = await ask('   Continue anyway? [y/N] ');
    if (!/^y(es)?$/i.test(go.trim())) {
      console.log('\nAborted. Nothing was changed.\n');
      process.exit(1);
    }
  }

  const sarvam = await askHidden(
    '\nSarvam API key (from dashboard.sarvam.ai, blank to skip): ',
  );

  const anakin = await askHidden(
    'Anakin API key for reading ticketing pages (blank to skip): ',
  );

  const otd = await askHidden(
    'Delhi Open Transit Data key for live buses (blank to skip): ',
  );

  console.log('\nWriting to Vercel (production):');

  const results = [
    setEnv('AUTH_PASSWORD_HASH', hashPassword(password)),
    setEnv('AUTH_SESSION_SECRET', randomBytes(48).toString('base64')),
  ];
  if (sarvam.trim()) results.push(setEnv('SARVAM_API_KEY', sarvam.trim()));
  if (anakin.trim()) results.push(setEnv('ANAKIN_API_KEY', anakin.trim()));
  if (otd.trim())    results.push(setEnv('OTD_API_KEY', otd.trim()));

  console.log('\nEnvironment variables only take effect on the next deploy:\n');
  console.log('  npm run deploy\n');

  if (results.some((ok) => !ok)) {
    console.log('Some variables were not set — see the notes above.\n');
    process.exit(1);
  }

  console.log('Then sign in with the username "admin" and the password you just chose.\n');
})();
