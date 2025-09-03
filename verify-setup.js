#!/usr/bin/env node

/**
 * Node.js/NPM Setup Verification Script
 * Ensures the project environment is properly configured for Node.js and NPM only
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Node.js and NPM setup for Clueboard Trivia Game...\n');

let allGood = true;

// Check Node.js version
try {
  const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
  const versionMatch = nodeVersion.match(/^v(\d+)\.(\d+)\.(\d+)/);

  if (!versionMatch) {
    console.error('❌ Could not parse Node.js version');
    allGood = false;
  } else {
    const [major, minor] = [parseInt(versionMatch[1]), parseInt(versionMatch[2])];
    console.log(`✅ Node.js version: ${nodeVersion}`);

    if (major < 18) {
      console.error('❌ Node.js version must be >=18.0.0');
      allGood = false;
    } else {
      console.log('✅ Node.js version meets requirements');
    }
  }
} catch (error) {
  console.error('❌ Node.js not found or not accessible');
  allGood = false;
}

// Check NPM version
try {
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  const versionMatch = npmVersion.match(/^(\d+)\.(\d+)/);

  if (!versionMatch) {
    console.error('❌ Could not parse NPM version');
    allGood = false;
  } else {
    const [major, minor] = [parseInt(versionMatch[1]), parseInt(versionMatch[2])];
    console.log(`✅ NPM version: ${npmVersion}`);

    if (major < 8) {
      console.error('❌ NPM version must be >=8.0.0');
      allGood = false;
    } else {
      console.log('✅ NPM version meets requirements');
    }
  }
} catch (error) {
  console.error('❌ NPM not found or not accessible');
  allGood = false;
}

// Check for Bun
try {
  execSync('which bun', { stdio: 'pipe' });
  console.error('⚠️  Bun is installed - this project is designed for Node.js/NPM only');
  console.log('   While Bun may work, this project is not tested with Bun and may have issues');
} catch (error) {
  console.log('✅ Bun not found - good!');
}

// Check package.json
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  console.log('✅ package.json found and valid');

  if (packageJson.engines) {
    console.log('✅ Engines field properly configured in package.json');
  } else {
    console.error('❌ Engines field missing from package.json');
    allGood = false;
  }

  if (packageJson.type === 'commonjs') {
    console.log('✅ CommonJS module system configured');
  } else {
    console.error('❌ Expected CommonJS module system');
    allGood = false;
  }
} catch (error) {
  console.error('❌ package.json not found or invalid');
  allGood = false;
}

// Check for package-lock.json
if (fs.existsSync('package-lock.json')) {
  console.log('✅ package-lock.json found (NPM lockfile)');
} else {
  console.log('⚠️  package-lock.json not found - run "npm install" to create it');
}

// Final result
console.log('\n' + '='.repeat(60));
if (allGood) {
  console.log('🎉 Setup verification PASSED!');
  console.log('   Your environment is ready for Clueboard Trivia Game development.');
  console.log('\n   Next steps:');
  console.log('   1. Run: npm install');
  console.log('   2. Run: npm run dev');
} else {
  console.log('❌ Setup verification FAILED!');
  console.log('   Please fix the issues above before proceeding.');
  console.log('\n   For help:');
  console.log('   - Install Node.js >=18.0.0 from https://nodejs.org/');
  console.log('   - NPM comes with Node.js automatically');
}
console.log('='.repeat(60) + '\n');
