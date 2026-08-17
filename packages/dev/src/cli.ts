#!/usr/bin/env node
import { DevServer } from './server.js';

const args = process.argv.slice(2);
let port = 4319;
let host = '127.0.0.1';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    const nextArg = args[i + 1];
    if (nextArg) {
      port = Number(nextArg);
    }
  }
  if (args[i] === '--host' || args[i] === '-h') {
    const nextArg = args[i + 1];
    if (nextArg) {
      host = nextArg;
    }
  }
}

const server = new DevServer({ port, host });

server
  .start()
  .then((url) => {
    console.log(`\n  🛡️  \x1b[1m\x1b[36mAegisLog Dev Inspector\x1b[0m is running at:`);
    console.log(`  \x1b[32m➜\x1b[0m  \x1b[1m\x1b[4m${url}\x1b[0m\n`);
    console.log(`  \x1b[90mWaiting for incoming log events on POST ${url}/api/events...\x1b[0m\n`);
  })
  .catch((err) => {
    console.error('Failed to start AegisLog Dev Inspector:', err);
    process.exit(1);
  });
