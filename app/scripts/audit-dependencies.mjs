import {spawnSync} from 'node:child_process';

// Resolve npm cross-platform. On Windows the executable installed by Node is npm.cmd.
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Audit runtime and build dependencies without advisory exceptions.
for (const args of [
  ['audit', '--omit=dev', '--audit-level=high'],
  ['audit', '--audit-level=high'],
]) {
  const result = spawnSync(npmCommand, args, {stdio: 'inherit'});
  if (result.error) {
    console.error(`Failed to execute ${npmCommand} ${args.join(' ')}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
