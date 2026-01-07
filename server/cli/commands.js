import { getConfig } from '../config.js';
import { resolveDbPath } from '../db.js';
import {
  findAvailablePort,
  isProcessRunning,
  printServerUrl,
  readPidFile,
  removePidFile,
  startDaemon,
  terminateProcess
} from './daemon.js';
import {
  cleanStaleInstances,
  findInstanceByWorkspace,
  registerInstance,
  unregisterInstance
} from './instance-registry.js';
import { openUrl, registerWorkspaceWithServer, waitForServer } from './open.js';

/**
 * Handle `start` command. Idempotent when already running.
 * - Spawns a detached server process, writes PID file, returns 0.
 * - If already running (PID file present and process alive), prints URL and returns 0.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStart(options) {
  // Default: do not open a browser unless explicitly requested via `open: true`.
  const should_open = options?.open === true;
  const new_instance = options?.new_instance === true;
  let port = options?.port;

  // Clean up stale instances before starting
  cleanStaleInstances();

  // Check for orphaned instance for current workspace
  if (new_instance) {
    const cwd = process.cwd();
    const orphan = findInstanceByWorkspace(cwd);

    if (orphan) {
      // Silently clean up orphaned instance and reuse its port
      if (!isProcessRunning(orphan.pid)) {
        removePidFile(orphan.port);
        unregisterInstance(orphan.port);
        port = orphan.port;
        console.log('Reusing port %d from orphaned instance', port);
      } else {
        // Instance is still running - this is the expected case
        console.warn('Server is already running on port %d', orphan.port);
        if (should_open) {
          process.env.PORT = String(orphan.port);
          const { url } = getConfig();
          await openUrl(url);
        }
        return 0;
      }
    }
  }

  // Auto port selection if no port specified
  if (!port) {
    let found_port;
    if (new_instance) {
      // For new instance, start from 3001 if global instance is on 3000
      const global_pid = readPidFile();
      const start_port =
        global_pid && isProcessRunning(global_pid) ? 3001 : 3000;
      found_port = await findAvailablePort(start_port);

      if (!found_port) {
        console.error('Could not find an available port (tried %d-%d)', start_port, start_port + 9);
        return 1;
      }

      port = found_port;
      console.log('Using port %d', port);
    } else {
      // For global instance, use default port from config (no auto-selection)
      // Port will remain undefined, using default behavior
    }
  }

  const existing_pid = readPidFile(new_instance ? port : undefined);
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
      console.error('Server is already running on port %d', port);
      return 1;
    }
  }
  if (existing_pid && !isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile(new_instance ? port : undefined);
  }

  // Set env vars in current process so getConfig() reflects the overrides
  if (options?.host) {
    process.env.HOST = options.host;
  }
  // Set PORT to the auto-selected or specified port
  if (port) {
    process.env.PORT = String(port);
  }

  const started = startDaemon({
    is_debug: options?.is_debug,
    host: options?.host,
    port: port
  });
  if (started && started.pid > 0) {
    // Register instance in registry if new_instance mode
    if (new_instance && port) {
      const cwd = process.cwd();
      registerInstance({
        workspace: cwd,
        port: port,
        pid: started.pid
      });
    }

    printServerUrl();
    // Auto-open the browser once for a fresh daemon start
    if (should_open) {
      const { url } = getConfig();
      // Wait briefly for the server to accept connections (single retry window)
      await waitForServer(url, 600);
      // Best-effort open; ignore result
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

  // Always unregister from registry (self-healing)
  if (port) {
    unregisterInstance(port);
  }

  if (!existing_pid) {
    // No PID file found - this is OK (self-healing)
    return 0;
  }

  if (!isProcessRunning(existing_pid)) {
    // stale PID file - clean it up
    removePidFile(port);
    return 0;
  }

  const terminated = await terminateProcess(existing_pid, 5000);
  if (terminated) {
    removePidFile(port);
    return 0;
  }

  // Not terminated within timeout
  return 1;
}

/**
 * Handle `restart` command: stop (ignore not-running) then start.
 *
 * @returns {Promise<number>} Exit code (0 on success)
 */
/**
 * Handle `restart` command: stop (ignore not-running) then start.
 * Accepts the same options as `handleStart` and passes them through,
 * so restart only opens a browser when `open` is explicitly true.
 *
 * @param {{ open?: boolean }} [options]
 * @returns {Promise<number>}
 */
export async function handleRestart(options) {
  const stop_code = await handleStop();
  // 0 = stopped, 2 = not running; both are acceptable to proceed
  if (stop_code !== 0 && stop_code !== 2) {
    return 1;
  }
  const start_code = await handleStart(options);
  return start_code === 0 ? 0 : 1;
}
