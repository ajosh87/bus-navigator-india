#!/usr/bin/env node
/**
 * Generates the values needed for login, without ever storing the password.
 *
 *   node scripts/hash-password.js
 *
 * Prints an AUTH_PASSWORD_HASH (scrypt, salted) and a fresh AUTH_SESSION_SECRET.
 * Set both in the Vercel project environment; the plaintext password is never
 * written anywhere.
 */

const { scryptSync, randomBytes } = require('node:crypto');
const readline = require('node:readline');

// Matches api/auth/login.ts — change both together or verification breaks.
const N = 32768, r = 8, p = 1, KEYLEN = 32;

function hash(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN, {
    N, r, p, maxmem: 256 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

function assess(pw) {
  const problems = [];
  if (pw.length < 12) problems.push('shorter than 12 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) problems.push('no mixed case');
  if (!/\d/.test(pw)) problems.push('no digits');
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push('no symbols');
  return problems;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Node cannot portably disable terminal echo here, so warn rather than pretend.
console.log('\nThe password will be visible as you type it.\n');

rl.question('Password: ', (password) => {
  rl.close();

  if (!password) {
    console.error('\nNo password entered.\n');
    process.exit(1);
  }

  const problems = assess(password);
  if (problems.length) {
    console.log(`\n⚠  Weak password: ${problems.join(', ')}.`);
    console.log('   scrypt makes guessing expensive, not impossible — length is what helps most.');
  }

  console.log('\nAdd these to your environment:\n');
  console.log(`AUTH_PASSWORD_HASH=${hash(password)}`);
  console.log(`AUTH_SESSION_SECRET=${randomBytes(48).toString('base64')}`);
  console.log(`AUTH_USERNAME=admin        # optional, defaults to "admin"`);
  console.log('\nFor Vercel:\n');
  console.log('  npx vercel env add AUTH_PASSWORD_HASH production');
  console.log('  npx vercel env add AUTH_SESSION_SECRET production');
  console.log('\nRotating AUTH_SESSION_SECRET invalidates every existing session.\n');
});
