import {spawnSync} from 'node:child_process';

const onWindows = process.platform === 'win32';

// Audit runtime and build dependencies without advisory exceptions.
// Windows command shims (npm.cmd) are resolved through cmd.exe; arguments are
// fixed constants here, so no untrusted input is passed through the shell.
for (const args of [
  ['audit', '--omit=dev', '--audit-level=high'],
  ['audit', '--audit-level=high'],
]) {
  const result = spawnSync('npm', args, {
    stdio: 'inherit',
    shell: onWindows,
  });
  if (result.error) {
    console.error(`Failed to execute npm ${args.join(' ')}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
