# Multi-Instance Implementation Code Examples

## Phase 1: Port-Specific PID/Log Files

### `server/cli/daemon.js` Changes

```javascript
/**
 * Resolve the PID file path. When port is provided, returns a port-specific
 * PID file to enable multiple independent instances.
 *
 * @param {number} [port] - Optional port number for instance-specific PID file
 * @returns {string}
 */
export function getPidFilePath(port) {
  const runtime_dir = getRuntimeDir();
  const filename = port ? `server-${port}.pid` : 'server.pid';
  return path.join(runtime_dir, filename);
}

/**
 * Resolve the log file path. When port is provided, returns a port-specific
 * log file to enable multiple independent instances.
 *
 * @param {number} [port] - Optional port number for instance-specific log file
 * @returns {string}
 */
export function getLogFilePath(port) {
  const runtime_dir = getRuntimeDir();
  const filename = port ? `daemon-${port}.log` : 'daemon.log';
  return path.join(runtime_dir, filename);
}

/**
 * Read PID from the PID file if present.
 *
 * @param {number} [port] - Optional port number for instance-specific PID file
 * @returns {number | null}
 */
export function readPidFile(port) {
  const pid_file = getPidFilePath(port);
  try {
    const text = fs.readFileSync(pid_file, 'utf8');
    const pid_value = Number.parseInt(text.trim(), 10);
    if (Number.isFinite(pid_value) && pid_value > 0) {
      return pid_value;
    }
  } catch {
    // ignore missing or unreadable
  }
  return null;
}

/**
 * Write PID to the PID file.
 *
 * @param {number} pid
 * @param {number} [port] - Optional port number for instance-specific PID file
 */
export function writePidFile(pid, port) {
  const pid_file = getPidFilePath(port);
  try {
    fs.writeFileSync(pid_file, String(pid) + '\n', { encoding: 'utf8' });
  } catch {
    // ignore write errors; daemon still runs but management degrades
  }
}

/**
 * Remove the PID file.
 *
 * @param {number} [port] - Optional port number for instance-specific PID file
 */
export function removePidFile(port) {
  const pid_file = getPidFilePath(port);
  try {
    fs.unlinkSync(pid_file);
  } catch {
    // ignore
  }
}

/**
 * Spawn the server as a detached daemon, redirecting stdio to the log file.
 * Writes the PID file upon success.
 *
 * @param {{ is_debug?: boolean, host?: string, port?: number }} [options]
 * @returns {{ pid: number } | null} Returns child PID on success; null on failure.
 */
export function startDaemon(options = {}) {
  const server_entry = getServerEntryPath();
  const log_file = getLogFilePath(options.port);

  // ... existing code ...

  try {
    const child = spawn(process.execPath, [server_entry], opts);
    child.unref();
    const child_pid = typeof child.pid === 'number' ? child.pid : -1;
    if (child_pid > 0) {
      if (options.is_debug) {
        console.debug('starting  ', child_pid);
      }
      writePidFile(child_pid, options.port);
      return { pid: child_pid };
    }
    return null;
  } catch (err) {
    // ... existing error handling ...
  }
}
```

### `server/cli/commands.js` Changes

```javascript
/**
 * Handle `start` command. Idempotent when already running.
 * - Spawns a detached server process, writes PID file, returns 0.
 * - If already running (PID file present and process alive), prints URL and returns 0.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStart(options) {
  const should_open = options?.open === true;
  const new_instance = options?.new_instance === true;
  const port = new_instance ? options?.port : undefined;
  
  const existing_pid = readPidFile(port);
  if (existing_pid && isProcessRunning(existing_pid)) {
    if (!new_instance) {
      // Default behavior: register workspace with running server
      const cwd = process.cwd();
      const db_info = resolveDbPath({ cwd });
      if (db_info.exists) {
        const { url } = getConfig();
        const registered = await registerWorkspaceWithServer(url, {
          path: cwd,
          database: db_info.path
        });
        if (registered) {
          console.log('Workspace registered: %s', cwd);
        }
      }
      console.warn('Server is already running.');
      if (should_open) {
        const { url } = getConfig();
        await openUrl(url);
      }
      return 0;
    } else {
      // New instance mode: error if already running on this port
      console.error('Server is already running on port %d', port || 3000);
      return 1;
    }
  }
  
  if (existing_pid && !isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile(port);
  }

  // Set env vars in current process so getConfig() reflects the overrides
  if (options?.host) {
    process.env.HOST = options.host;
  }
  if (options?.port) {
    process.env.PORT = String(options.port);
  }

  const started = startDaemon({
    is_debug: options?.is_debug,
    host: options?.host,
    port: options?.port
  });
  
  if (started && started.pid > 0) {
    printServerUrl();
    if (should_open) {
      const { url } = getConfig();
      await waitForServer(url, 600);
      await openUrl(url);
    }
    return 0;
  }

  return 1;
}

/**
 * Handle `stop` command.
 * - Sends SIGTERM and waits for exit (with SIGKILL fallback), removes PID file.
 * - Returns 2 if not running.
 *
 * @param {{ port?: number }} [options]
 * @returns {Promise<number>} Exit code
 */
export async function handleStop(options) {
  const port = options?.port;
  const existing_pid = readPidFile(port);

  if (!existing_pid) {
    return 2;
  }

  if (!isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile(port);
    return 2;
  }

  const terminated = await terminateProcess(existing_pid, 5000);
  if (terminated) {
    removePidFile(port);
    return 0;
  }

  // Not terminated within timeout
  return 1;
}
```

### `server/cli/index.js` Changes

```javascript
/**
 * Parse argv into a command token, flags, and options.
 *
 * @param {string[]} args
 * @returns {{ command: string | null, flags: string[], options: { host?: string, port?: number } }}
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const flags = [];
  /** @type {string | null} */
  let command = null;
  /** @type {{ host?: string, port?: number }} */
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--help' || token === '-h') {
      flags.push('help');
      continue;
    }
    if (token === '--debug' || token === '-d') {
      flags.push('debug');
      continue;
    }
    if (token === '--open') {
      flags.push('open');
      continue;
    }
    if (token === '--new-instance') {
      flags.push('new-instance');
      continue;
    }
    if (token === '--force') {
      flags.push('force');
      continue;
    }
    if (token === '--cleanup-orphans') {
      flags.push('cleanup-orphans');
      continue;
    }
    if (token === '--host' && i + 1 < args.length) {
      options.host = args[++i];
      continue;
    }
    if (token === '--port' && i + 1 < args.length) {
      const port_value = Number.parseInt(args[++i], 10);
      if (Number.isFinite(port_value) && port_value > 0) {
        options.port = port_value;
      }
      continue;
    }
    if (
      !command &&
      (token === 'start' || token === 'stop' || token === 'restart' || token === 'remove-instance')
    ) {
      command = token;
      continue;
    }
  }

  return { command, flags, options };
}

// In main() function:
if (command === 'start') {
  const start_options = {
    open: flags.includes('open'),
    is_debug: is_debug || Boolean(process.env.DEBUG),
    host: options.host,
    port: options.port,
    new_instance: flags.includes('new-instance')
  };
  return await handleStart(start_options);
}

if (command === 'remove-instance') {
  const remove_options = {
    port: options.port,
    force: flags.includes('force'),
    cleanup_orphans: flags.includes('cleanup-orphans')
  };
  return await handleRemoveInstance(remove_options);
}
```

## Phase 2: Instance Registry

### `server/cli/instance-registry.js` (NEW FILE)

```javascript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isProcessRunning } from './daemon.js';

/**
 * @typedef {Object} InstanceEntry
 * @property {string} workspace - Absolute path to workspace directory
 * @property {number} port - Port number the instance is running on
 * @property {number} pid - Process ID
 * @property {string} started_at - ISO timestamp when instance was started
 */

/**
 * Get the path to the instance registry file.
 *
 * @returns {string}
 */
export function getRegistryPath() {
  const runtime_dir = process.env.BDUI_RUNTIME_DIR ||
    (process.env.XDG_RUNTIME_DIR
      ? path.join(process.env.XDG_RUNTIME_DIR, 'beads-ui')
      : path.join(os.tmpdir(), 'beads-ui'));

  // Ensure directory exists
  try {
    fs.mkdirSync(runtime_dir, { recursive: true, mode: 0o700 });
  } catch {
    // ignore
  }

  return path.join(runtime_dir, 'instances.json');
}

/**
 * Read and parse the instance registry.
 *
 * @returns {InstanceEntry[]}
 */
export function readInstanceRegistry() {
  const registry_path = getRegistryPath();
  try {
    const content = fs.readFileSync(registry_path, 'utf8');
    const data = JSON.parse(content);
    if (data && Array.isArray(data.instances)) {
      return data.instances;
    }
    return [];
  } catch {
    // Missing file or parse error - return empty array
    return [];
  }
}

/**
 * Write the instance registry atomically.
 *
 * @param {InstanceEntry[]} instances
 */
export function writeInstanceRegistry(instances) {
  const registry_path = getRegistryPath();
  const temp_path = registry_path + '.tmp';
  const data = { instances };

  try {
    fs.writeFileSync(temp_path, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temp_path, registry_path);
  } catch (err) {
    // Clean up temp file on error
    try {
      fs.unlinkSync(temp_path);
    } catch {
      // ignore
    }
    throw err;
  }
}

/**
 * Register a new instance or update an existing one.
 *
 * @param {{ workspace: string, port: number, pid: number }} instance
 */
export function registerInstance(instance) {
  const instances = readInstanceRegistry();
  const normalized_workspace = path.resolve(instance.workspace);

  // Remove any existing entry for this port
  const filtered = instances.filter((i) => i.port !== instance.port);

  // Add new entry
  filtered.push({
    workspace: normalized_workspace,
    port: instance.port,
    pid: instance.pid,
    started_at: new Date().toISOString()
  });

  writeInstanceRegistry(filtered);
}

/**
 * Unregister an instance by port.
 *
 * @param {number} port
 */
export function unregisterInstance(port) {
  const instances = readInstanceRegistry();
  const filtered = instances.filter((i) => i.port !== port);
  writeInstanceRegistry(filtered);
}

/**
 * Find an instance by workspace path.
 * Matches exact workspace or parent workspace.
 *
 * @param {string} workspace
 * @returns {InstanceEntry | null}
 */
export function findInstanceByWorkspace(workspace) {
  const instances = readInstanceRegistry();
  const normalized = path.resolve(workspace);

  // First try exact match
  for (const instance of instances) {
    if (path.resolve(instance.workspace) === normalized) {
      return instance;
    }
  }

  // Then try to find if workspace is inside an instance's workspace
  for (const instance of instances) {
    const instance_workspace = path.resolve(instance.workspace);
    if (normalized.startsWith(instance_workspace + path.sep)) {
      return instance;
    }
  }

  return null;
}

/**
 * Find an instance by port.
 *
 * @param {number} port
 * @returns {InstanceEntry | null}
 */
export function findInstanceByPort(port) {
  const instances = readInstanceRegistry();
  return instances.find((i) => i.port === port) || null;
}

/**
 * Remove entries for processes that are no longer running.
 *
 * @returns {number} Number of stale instances removed
 */
export function cleanStaleInstances() {
  const instances = readInstanceRegistry();
  const alive = instances.filter((i) => isProcessRunning(i.pid));

  if (alive.length < instances.length) {
    writeInstanceRegistry(alive);
    return instances.length - alive.length;
  }

  return 0;
}
```

## Phase 3: Enhanced Restart

### `server/cli/commands.js` - Restart Enhancement

```javascript
/**
 * Handle `restart` command: stop (ignore not-running) then start.
 * Accepts the same options as `handleStart` and passes them through.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>}
 */
export async function handleRestart(options) {
  const new_instance = options?.new_instance === true;
  let port = options?.port;

  // If new_instance mode and no port specified, try to find instance for current workspace
  if (new_instance && !port) {
    const cwd = process.cwd();
    const instance = findInstanceByWorkspace(cwd);
    if (instance) {
      port = instance.port;
      console.log('Found instance for workspace on port %d', port);
    } else {
      console.error('No instance found for workspace: %s', cwd);
      console.error('Use --port to specify which instance to restart');
      return 1;
    }
  }

  const stop_code = await handleStop({ port });
  // 0 = stopped, 2 = not running; both are acceptable to proceed
  if (stop_code !== 0 && stop_code !== 2) {
    return 1;
  }

  const start_code = await handleStart(options);
  return start_code === 0 ? 0 : 1;
}
```

## Phase 4: Remove Instance Command

### `server/cli/commands.js` - Remove Instance Handler

```javascript
import {
  findInstanceByWorkspace,
  findInstanceByPort,
  unregisterInstance,
  getAllOrphanedInstances
} from './instance-registry.js';

/**
 * Handle `remove-instance` command.
 * Removes instance registry entry and associated PID file.
 *
 * @param {{ port?: number, force?: boolean, cleanup_orphans?: boolean }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleRemoveInstance(options) {
  const force = options?.force === true;
  const cleanup_orphans = options?.cleanup_orphans === true;

  // Handle cleanup-orphans mode
  if (cleanup_orphans) {
    const orphans = getAllOrphanedInstances();
    if (orphans.length === 0) {
      console.log('No orphaned instances found.');
      return 0;
    }

    console.log('Found %d orphaned instance(s):', orphans.length);
    for (const orphan of orphans) {
      console.log('  Port %d: %s (PID %d)', orphan.port, orphan.workspace, orphan.pid);
      unregisterInstance(orphan.port);
      removePidFile(orphan.port);
    }
    console.log('Cleaned up %d orphaned instance(s).', orphans.length);
    return 0;
  }

  // Find instance to remove
  let instance;
  if (options?.port) {
    instance = findInstanceByPort(options.port);
    if (!instance) {
      console.error('No instance found on port %d', options.port);
      return 1;
    }
  } else {
    const cwd = process.cwd();
    instance = findInstanceByWorkspace(cwd);
    if (!instance) {
      console.error('No instance found for workspace: %s', cwd);
      return 1;
    }
  }

  // Check if process is still running
  if (!force && isProcessRunning(instance.pid)) {
    console.error('Instance is still running (PID %d)', instance.pid);
    console.error('Stop the instance first with: bdui stop --port %d', instance.port);
    console.error('Or use --force to remove anyway');
    return 1;
  }

  // Remove instance
  unregisterInstance(instance.port);
  removePidFile(instance.port);

  console.log('Removed instance:');
  console.log('  Workspace: %s', instance.workspace);
  console.log('  Port: %d', instance.port);
  console.log('  PID: %d', instance.pid);

  return 0;
}
```

### `server/cli/instance-registry.js` - Additional Functions

```javascript
/**
 * Get all instances that have dead processes.
 *
 * @returns {InstanceEntry[]}
 */
export function getAllOrphanedInstances() {
  const instances = readInstanceRegistry();
  return instances.filter((i) => !isProcessRunning(i.pid));
}

/**
 * Remove an instance by workspace path.
 *
 * @param {string} workspace
 * @returns {boolean} True if instance was found and removed
 */
export function removeInstanceByWorkspace(workspace) {
  const instance = findInstanceByWorkspace(workspace);
  if (!instance) {
    return false;
  }
  unregisterInstance(instance.port);
  return true;
}

/**
 * Remove an instance by port.
 * This is just an alias for unregisterInstance for consistency.
 *
 * @param {number} port
 * @returns {boolean} True if instance was found and removed
 */
export function removeInstanceByPort(port) {
  const instance = findInstanceByPort(port);
  if (!instance) {
    return false;
  }
  unregisterInstance(port);
  return true;
}

/**
 * Check if an instance is orphaned (process not running).
 *
 * @param {InstanceEntry} instance
 * @returns {boolean}
 */
export function isInstanceOrphaned(instance) {
  return !isProcessRunning(instance.pid);
}
```

## Phase 5: Orphan Detection on Start

### `server/cli/commands.js` - Enhanced Start with Orphan Detection

```javascript
/**
 * Detect and clean up orphaned instance for the current workspace.
 * Shows warning and removes the orphan from registry.
 * Attempts to use the same port as the orphan, if available.
 * If port is not available, falls back to automatic port selection.
 *
 * @param {string} workspace
 * @returns {InstanceEntry | null} The orphaned instance that was cleaned, or null
 */
function detectAndCleanOrphan(workspace) {
  const instance = findInstanceByWorkspace(workspace);
  if (!instance) {
    return null;
  }

  if (isProcessRunning(instance.pid)) {
    return null; // Not an orphan
  }

  // Found orphan - show warning
  console.warn('Warning: Found orphaned instance for this workspace');
  console.warn('  Port: %d', instance.port);
  console.warn('  PID: %d (not running)', instance.pid);
  console.warn('  Workspace: %s', instance.workspace);
  console.warn('');
  console.warn('Cleaning up orphaned instance...');

  // Clean up
  unregisterInstance(instance.port);
  removePidFile(instance.port);

  return instance;
}

/**
 * Handle `start` command with orphan detection.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStart(options) {
  const should_open = options?.open === true;
  const new_instance = options?.new_instance === true;
  const port = new_instance ? options?.port : undefined;

  // Detect and clean orphans when starting in new-instance mode
  if (new_instance) {
    const cwd = process.cwd();
    const orphan = detectAndCleanOrphan(cwd);
    if (orphan) {
      console.log('Found orphaned instance using port %d and cleaned up.', orphan.port); 
    }
  }

  // if orphan found and cleaned, set the port to use the same port
  if (orphan) {
    port = orphan.port;
    console.log('Attempting to re-use port %d of orphaned instance...', port);
  }

  const existing_pid = readPidFile(port);
  if (existing_pid && isProcessRunning(existing_pid)) {
    if (!new_instance) {
      // Default behavior: register workspace with running server
      const cwd = process.cwd();
      const db_info = resolveDbPath({ cwd });
      if (db_info.exists) {
        const { url } = getConfig();
        const registered = await registerWorkspaceWithServer(url, {
          path: cwd,
          database: db_info.path
        });
        if (registered) {
          console.log('Workspace registered: %s', cwd);
        }
      }
      console.warn('Server is already running.');
      if (should_open) {
        const { url } = getConfig();
        await openUrl(url);
      }
      return 0;
    } else {
      // New instance mode: error if already running on this port
      console.error('Server is already running on port %d', port || 3000);
      return 1;
    }
  }

  if (existing_pid && !isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile(port);
  }

  // Set env vars in current process so getConfig() reflects the overrides
  if (options?.host) {
    process.env.HOST = options.host;
  }
  if (options?.port) {
    process.env.PORT = String(options.port);
  }

  const started = startDaemon({
    is_debug: options?.is_debug,
    host: options?.host,
    port: options?.port
  });

  if (started && started.pid > 0) {
    // Register instance in registry when using new-instance mode
    if (new_instance) {
      const cwd = process.cwd();
      registerInstance({
        workspace: cwd,
        port: options?.port || 3000,
        pid: started.pid
      });
    }

    printServerUrl();
    if (should_open) {
      const { url } = getConfig();
      await waitForServer(url, 600);
      await openUrl(url);
    }
    return 0;
  }

  return 1;
}
```

## Usage Examples

### Single Instance (Default Behavior - Unchanged)

```bash
# Start server on default port 3000
cd ~/project-a
bdui start --open

# Register another workspace with the same server
cd ~/project-b
bdui start  # Registers with running server

# Restart the global instance
bdui restart

# Stop the global instance
bdui stop
```

### Multi-Instance (New Behavior)

```bash
# Start independent instance on port 3000
cd ~/project-a
bdui start --port 3000 --new-instance --open

# Start another independent instance on port 8080
cd ~/project-b
bdui start --port 8080 --new-instance --open

# Restart specific instance by port
bdui restart --port 3000 --new-instance

# Or restart by workspace (auto-detects port)
cd ~/project-a
bdui restart --new-instance

# Stop specific instance
bdui stop --port 3000

# Remove instance for current workspace
cd ~/project-a
bdui remove-instance

# Remove instance by port (force if process is dead)
bdui remove-instance --port 3000 --force

# Clean up all orphaned instances
bdui remove-instance --cleanup-orphans
```

### Orphan Detection Example

```bash
# After system reboot, all instances are orphaned
cd ~/project-a
bdui start --new-instance

# Output:
# Warning: Found orphaned instance for this workspace
#   Port: 3000
#   PID: 12345 (not running)
#   Workspace: /Users/me/project-a
#
# Cleaning up orphaned instance...
#
# beads db   /Users/me/project-a/.beads/issues.db (nearest)
# beads ui   listening on http://127.0.0.1:3000
```

## Testing Examples

### Unit Test Example

```javascript
// server/cli/instance-registry.test.js
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  getRegistryPath,
  readInstanceRegistry,
  writeInstanceRegistry,
  registerInstance,
  unregisterInstance,
  findInstanceByWorkspace,
  findInstanceByPort
} from './instance-registry.js';

describe('instance registry', () => {
  let registry_path;

  beforeEach(() => {
    registry_path = getRegistryPath();
    // Clean up before each test
    try {
      fs.unlinkSync(registry_path);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    // Clean up after each test
    try {
      fs.unlinkSync(registry_path);
    } catch {
      // ignore
    }
  });

  test('readInstanceRegistry returns empty array when file missing', () => {
    const instances = readInstanceRegistry();
    expect(instances).toEqual([]);
  });

  test('registerInstance creates new entry', () => {
    registerInstance({
      workspace: '/tmp/test',
      port: 3000,
      pid: 12345
    });

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(1);
    expect(instances[0].port).toBe(3000);
    expect(instances[0].pid).toBe(12345);
  });

  test('findInstanceByPort finds registered instance', () => {
    registerInstance({
      workspace: '/tmp/test',
      port: 3000,
      pid: 12345
    });

    const instance = findInstanceByPort(3000);
    expect(instance).not.toBeNull();
    expect(instance?.pid).toBe(12345);
  });
});
```

## Updated CLI Usage

### `server/cli/usage.js` - Updated Help Text

```javascript
/**
 * Print CLI usage to a stream-like target.
 *
 * @param {{ write: (chunk: string) => any }} out_stream
 */
export function printUsage(out_stream) {
  const lines = [
    'Usage: bdui <command> [options]',
    '',
    'Commands:',
    '  start              Start the UI server',
    '  stop               Stop the UI server',
    '  restart            Restart the UI server',
    '  remove-instance    Remove instance registry entry',
    '',
    'Options:',
    '  -h, --help             Show this help message',
    '  -d, --debug            Enable debug logging',
    '      --open             Open the browser after start/restart',
    '      --host <addr>      Bind to a specific host (default: 127.0.0.1)',
    '      --port <num>       Bind to a specific port (default: 3000)',
    '      --new-instance     Start a new independent instance (multi-instance mode)',
    '      --force            Force removal of instance even if process is dead',
    '      --cleanup-orphans  Remove all orphaned instances',
    '',
    'Examples:',
    '  # Single instance (default)',
    '  bdui start --open',
    '',
    '  # Multi-instance mode',
    '  bdui start --port 3000 --new-instance',
    '  bdui start --port 8080 --new-instance',
    '',
    '  # Remove instance',
    '  bdui remove-instance                    # Remove instance for current workspace',
    '  bdui remove-instance --port 3000        # Remove instance by port',
    '  bdui remove-instance --cleanup-orphans  # Clean up all orphaned instances',
    ''
  ];
  for (const line of lines) {
    out_stream.write(line + '\n');
  }
}
```
