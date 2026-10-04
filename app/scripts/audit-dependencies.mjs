import {spawnSync} from 'node:child_process';

// Audit runtime and build dependencies without advisory exceptions.
for (const args of [
  ['audit', '--omit=dev', '--audit-level=high'],
  ['audit', '--audit-level=high'],
]) {
  const result = spawnSync('npm', args, {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}
