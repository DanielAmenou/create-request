#!/usr/bin/env node

import { glob } from 'glob';
import { spawn } from 'child_process';

// Find all test files matching the pattern
const testFiles = await glob('test/**/*.test.ts');

if (testFiles.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

// Run node with tsx and test files
const args = ['--import', 'tsx', '--test', ...testFiles];

const proc = spawn('node', args, {
  stdio: 'inherit',
});

proc.on('exit', (code) => {
  process.exit(code ?? 0);
});

