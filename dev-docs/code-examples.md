# Multi-Instance Implementation Code Examples (Simplified)

## Overview

This document contains code examples for the simplified multi-instance design:
- **One new flag**: `--new-instance`
- **No new commands**: Registry cleanup folded into `stop`
- **Self-healing**: Automatic orphan cleanup
- **Invisible registry**: Internal implementation detail only

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
  fs.writeFileSync(pid_file, String(pid), 'utf8');
}

/**
 * Remove the PID file if it exists.
 *
 * @param {number} [port] - Optional port number for instance-specific PID file
 */
export function removePidFile(port) {
  const pid_file = getPidFilePath(port);
  try {
    fs.unlinkSync(pid_file);
  } catch {
    // ignore if file doesn't exist
  }
}

/**
 * Find an available port starting from the given port.
 * Tries up to 10 consecutive ports.
 *
 * @param {number} start_port - Port to start searching from
 * @returns {Promise<number | null>} Available port or null if none found
 */
export async function findAvailablePort(start_port) {
  const net = await import('node:net');

  for (let i = 0; i < 10; i++) {
    const port = start_port + i;

    // Try to create a server on this port
    const is_available = await new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', () => {
        resolve(false);
      });

      server.once('listening', () => {
        server.close();
        resolve(true);
      });

      server.listen(port);
    });

    if (is_available) {
      return port;
    }
  }

  return null;
}

/**
 * Start the daemon process.
 *
 * @param {{ is_debug?: boolean, host?: string, port?: number }} [options]
 * @returns {{ pid: number } | null}
 */
export function startDaemon(options) {
  const port = options?.port;
  const log_file = getLogFilePath(port);
  
  // ... existing daemon spawn logic ...
  
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', log_fd, log_fd],
    env: process.env
  });
  
  child.unref();
  writePidFile(child.pid, port);
  
  return { pid: child.pid };
}
```

### `server/cli/index.js` - CLI Parsing

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
      (token === 'start' || token === 'stop' || token === 'restart')
    ) {
      command = token;
      continue;
    }
  }

  return { command, flags, options };
}
```

## Phase 2: Instance Registry (Internal Implementation Detail)

### `server/cli/instance-registry.js` (NEW FILE)

```javascript
/**
 * @import { InstanceEntry } from './instance-registry.types.js'
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRuntimeDir } from './daemon.js';

/**
 * Get the path to the instance registry file.
 *
 * @returns {string}
 */
export function getRegistryPath() {
  const runtime_dir = getRuntimeDir();
  return path.join(runtime_dir, 'instances.json');
}

/**
 * Read the instance registry. Returns empty array if file doesn't exist
 * or is corrupted.
 *
 * @returns {InstanceEntry[]}
 */
export function readInstanceRegistry() {
  const registry_path = getRegistryPath();
  try {
    const text = fs.readFileSync(registry_path, 'utf8');
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data;
    }
  } catch {
    // File doesn't exist or is corrupted - return empty array
  }
  return [];
}

/**
 * Write the instance registry atomically.
 *
 * @param {InstanceEntry[]} instances
 */
export function writeInstanceRegistry(instances) {
  const registry_path = getRegistryPath();
  const temp_path = registry_path + '.tmp';

  // Write to temp file first
  fs.writeFileSync(temp_path, JSON.stringify(instances, null, 2), 'utf8');

  // Atomic rename
  fs.renameSync(temp_path, registry_path);
}

/**
 * Register a new instance or update existing one.
 *
 * @param {{ workspace: string, port: number, pid: number }} instance
 */
export function registerInstance(instance) {
  const instances = readInstanceRegistry();

  // Remove existing entry for this port (if any)
  const filtered = instances.filter((i) => i.port !== instance.port);

  // Add new entry
  filtered.push({
    workspace: instance.workspace,
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
 * Find instance by workspace path.
 *
 * @param {string} workspace
 * @returns {InstanceEntry | null}
 */
export function findInstanceByWorkspace(workspace) {
  const instances = readInstanceRegistry();
  return instances.find((i) => i.workspace === workspace) || null;
}

/**
 * Find instance by port.
 *
 * @param {number} port
 * @returns {InstanceEntry | null}
 */
export function findInstanceByPort(port) {
  const instances = readInstanceRegistry();
  return instances.find((i) => i.port === port) || null;
}

/**
 * Check if a process is running.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

### `server/cli/instance-registry.types.ts` (NEW FILE)

```typescript
/**
 * Instance registry entry.
 */
export interface InstanceEntry {
  workspace: string;
  port: number;
  pid: number;
  started_at: string;
}
```

## Phase 3: Enhanced Stop Command (Self-Healing)

### `server/cli/commands.js` - Updated Stop Handler

```javascript
import { unregisterInstance, findInstanceByPort } from './instance-registry.js';

/**
 * Handle `stop` command. Always cleans up both process AND registry entry.
 * This makes the system self-healing - no orphaned registry entries.
 *
 * @param {{ port?: number }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStop(options) {
  const port = options?.port;
  const existing_pid = readPidFile(port);

  // Try to stop the process if it's running
  if (existing_pid && isProcessRunning(existing_pid)) {
    try {
      process.kill(existing_pid, 'SIGTERM');

      // Wait for graceful shutdown (up to 5 seconds)
      for (let i = 0; i < 50; i++) {
        if (!isProcessRunning(existing_pid)) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Force kill if still running
      if (isProcessRunning(existing_pid)) {
        process.kill(existing_pid, 'SIGKILL');
      }
    } catch (err) {
      // Process might have already exited - that's fine
    }
  }

  // ALWAYS clean up, whether process was running or not
  removePidFile(port);

  if (port) {
    unregisterInstance(port);
  }

  console.log('Server stopped.');
  return 0;
}
```

## Phase 4: Enhanced Start Command (Silent Orphan Cleanup + Auto Port Selection)

### `server/cli/commands.js` - Updated Start Handler

```javascript
import {
  registerInstance,
  findInstanceByWorkspace,
  unregisterInstance,
  isProcessRunning
} from './instance-registry.js';
import { findAvailablePort } from './daemon.js';

/**
 * Handle `start` command with silent orphan cleanup and auto port selection.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStart(options) {
  const should_open = options?.open === true;
  const new_instance = options?.new_instance === true;
  let port = options?.port;

  // Auto port selection if no port specified
  if (!port) {
    if (new_instance) {
      // For new instance, start from 3001 if global instance is on 3000
      const global_pid = readPidFile();
      const start_port = (global_pid && isProcessRunning(global_pid)) ? 3001 : 3000;
      port = await findAvailablePort(start_port);
    } else {
      // For global instance, start from 3000
      port = await findAvailablePort(3000);
    }

    if (!port) {
      console.error('Could not find an available port (tried 3000-3009)');
      return 1;
    }

    console.log('Using port %d', port);
  }

  // Silent orphan cleanup when starting in new-instance mode
  if (new_instance) {
    const cwd = process.cwd();
    const existing = findInstanceByWorkspace(cwd);

    if (existing && !isProcessRunning(existing.pid)) {
      // Orphan found - clean it up silently and reuse the port if available
      unregisterInstance(existing.port);
      removePidFile(existing.port);

      // Try to reuse the same port if not specified and available
      if (!port) {
        const orphan_port_available = await findAvailablePort(existing.port);
        if (orphan_port_available === existing.port) {
          port = existing.port;
          console.log('Reusing port %d from previous instance', port);
        }
      }
    }
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

## Phase 5: Smart Restart Command (Context-Aware)

### `server/cli/commands.js` - Updated Restart Handler

```javascript
/**
 * Handle `restart` command with automatic context detection.
 *
 * Smart behavior:
 * 1. If port specified → restart that specific port
 * 2. Otherwise, check if instance exists for current workspace → restart that
 * 3. Otherwise → fall back to default behavior (global instance)
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleRestart(options) {
  let port = options?.port;
  let new_instance = false;

  // If no port specified, try to find instance for current workspace
  if (!port) {
    const cwd = process.cwd();
    const instance = findInstanceByWorkspace(cwd);
    if (instance) {
      // Found workspace instance - restart it
      port = instance.port;
      new_instance = true;
      console.log('Restarting workspace instance on port %d...', port);
    }
    // Otherwise, fall back to default behavior (global instance)
  }

  // Stop (which unregisters if port-specific)
  await handleStop({ port });

  // Start (which re-registers if new_instance)
  return await handleStart({
    ...options,
    port,
    new_instance
  });
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
bdui restart  # Just works!

# Stop the global instance
bdui stop
```

### Multi-Instance (New Behavior)

```bash
# Start independent instance - auto-selects port!
cd ~/project-a
bdui start --new-instance --open
# Output: Using port 3001 (if global instance is on 3000)

# Start another independent instance - auto-selects next port!
cd ~/project-b
bdui start --new-instance --open
# Output: Using port 3002

# Or specify port explicitly if you prefer
cd ~/project-c
bdui start --port 8080 --new-instance --open

# Restart - automatically detects workspace instance!
cd ~/project-a
bdui restart  # Finds and restarts port 3001 instance automatically!

# Or restart specific port explicitly
bdui restart --port 3000

# Stop specific instance (always cleans up registry)
bdui stop --port 3001
```

### Silent Orphan Cleanup + Port Reuse Example

```bash
# After system reboot, all instances are orphaned
# project-a was previously on port 3001
cd ~/project-a
bdui start --new-instance

# Output (orphan cleaned up silently, same port reused):
# Reusing port 3001 from previous instance
# beads db   /Users/me/project-a/.beads/issues.db (nearest)
# beads ui   listening on http://127.0.0.1:3001

# No warning needed - the system just works!
# Same port as before - seamless experience!

# Restart also works seamlessly
bdui restart  # Auto-detects workspace instance and restarts it!
```

### Auto Port Selection Example

```bash
# Global instance already running on 3000
bdui start --new-instance
# Output: Using port 3001

# Another instance
cd ~/another-project
bdui start --new-instance
# Output: Using port 3002

# If 3000 is not available, global instance auto-selects too
bdui start
# Output: Using port 3001 (if 3000 is taken)

# After reboot, orphan port is reused
cd ~/project-a  # Was previously on 3001
bdui start --new-instance
# Output: Reusing port 3001 from previous instance
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
    '',
    'Options:',
    '  -h, --help             Show this help message',
    '  -d, --debug            Enable debug logging',
    '      --open             Open the browser after start/restart',
    '      --host <addr>      Bind to a specific host (default: 127.0.0.1)',
    '      --port <num>       Bind to a specific port (default: 3000)',
    '      --new-instance     Start a new independent instance (multi-instance mode)',
    '',
    'Examples:',
    '  # Single instance (default)',
    '  bdui start --open',
    '',
    '  # Multi-instance mode',
    '  bdui start --new-instance  # Auto-selects port!',
    '  bdui start --port 8080 --new-instance  # Or specify port',
    '  bdui stop --port 3001',
    '  bdui restart  # Auto-detects workspace instance!',
    ''
  ];
  for (const line of lines) {
    out_stream.write(line + '\n');
  }
}
```

## Key Simplifications

1. **No `remove-instance` command** - Registry cleanup folded into `stop`
2. **No `--force` flag** - `stop` works whether process is running or not
3. **No `--cleanup-orphans` flag** - Cleanup happens automatically and silently
4. **No `--new-instance` flag for restart** - Automatically detects workspace instance
5. **No `--port` required** - Auto-selects available port intelligently
6. **Registry is invisible** - Users never interact with it directly
7. **Self-healing design** - System "just works" without user intervention
