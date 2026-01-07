import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as daemon from './daemon.js';
import * as registry from './instance-registry.js';
import { handleRestart } from './commands.js';

describe('handleRestart with smart workspace detection (Phase 3)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('restarts workspace instance when found', async () => {
    // Mock workspace instance exists on port 3005
    vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
    vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
      workspace: '/test/workspace',
      port: 3005,
      pid: 99999
    });
    // For handleStop and handleStart - return PID first time, null after
    let call_count = 0;
    vi.spyOn(daemon, 'readPidFile').mockImplementation(() => {
      call_count++;
      return call_count === 1 ? 99999 : null;
    });
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    const terminate_spy = vi
      .spyOn(daemon, 'terminateProcess')
      .mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
    const unregister_spy = vi
      .spyOn(registry, 'unregisterInstance')
      .mockImplementation(() => {});
    // For handleStart
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3005);
    vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 11111 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});
    const console_spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await handleRestart({ open: false });

    expect(result).toBe(0);
    // Should detect workspace instance
    expect(console_spy).toHaveBeenCalledWith(
      'Restarting workspace instance on port 3005'
    );
    // Should stop the workspace instance
    expect(terminate_spy).toHaveBeenCalledWith(99999, 5000);
    expect(unregister_spy).toHaveBeenCalledWith(3005);
    // Should start with new_instance flag and same port
    expect(daemon.startDaemon).toHaveBeenCalledWith({
      port: 3005,
      host: undefined,
      is_debug: undefined
    });
    expect(registry.registerInstance).toHaveBeenCalledWith({
      workspace: process.cwd(),
      port: 3005,
      pid: 11111
    });
  });

  test('restarts global instance when no workspace instance found', async () => {
    // No workspace instance found
    vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
    vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue(null);
    // For handleStop and handleStart - return PID first time, null after
    let call_count = 0;
    vi.spyOn(daemon, 'readPidFile').mockImplementation((port) => {
      call_count++;
      if (port === undefined && call_count === 1) {
        return 88888;
      }
      return null;
    });
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    const terminate_spy = vi
      .spyOn(daemon, 'terminateProcess')
      .mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
    vi.spyOn(registry, 'unregisterInstance').mockImplementation(() => {});
    // For handleStart
    vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 22222 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const result = await handleRestart({ open: false });

    expect(result).toBe(0);
    // Should stop default instance
    expect(terminate_spy).toHaveBeenCalledWith(88888, 5000);
    // Should start without new_instance flag (default behavior)
    expect(daemon.startDaemon).toHaveBeenCalledWith({
      port: undefined,
      host: undefined,
      is_debug: undefined
    });
    // Should NOT register (default instance)
    expect(registry.registerInstance).not.toHaveBeenCalled();
  });

  test('restarts specific port when --port specified', async () => {
    vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
    // Should NOT check for workspace instance when port is specified
    const find_spy = vi
      .spyOn(registry, 'findInstanceByWorkspace')
      .mockReturnValue(null);
    // For handleStop and handleStart - return PID first time, null after
    let call_count = 0;
    vi.spyOn(daemon, 'readPidFile').mockImplementation(() => {
      call_count++;
      return call_count === 1 ? 77777 : null;
    });
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    const terminate_spy = vi
      .spyOn(daemon, 'terminateProcess')
      .mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
    const unregister_spy = vi
      .spyOn(registry, 'unregisterInstance')
      .mockImplementation(() => {});
    // For handleStart
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3002);
    vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 33333 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const result = await handleRestart({ port: 3002, open: false });

    expect(result).toBe(0);
    // Should NOT look for workspace instance
    expect(find_spy).not.toHaveBeenCalled();
    // Should stop the specified port
    expect(terminate_spy).toHaveBeenCalledWith(77777, 5000);
    expect(unregister_spy).toHaveBeenCalledWith(3002);
    // Should start on the specified port
    expect(daemon.startDaemon).toHaveBeenCalledWith({
      port: 3002,
      host: undefined,
      is_debug: undefined
    });
  });

  test('handles restart when instance not running', async () => {
    vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
    vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
      workspace: '/test/workspace',
      port: 3005,
      pid: 99999
    });
    // For handleStop
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    // For handleStart
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3005);
    vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 44444 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const result = await handleRestart({ open: false });

    expect(result).toBe(0);
    // Should still start successfully
    expect(daemon.startDaemon).toHaveBeenCalled();
  });
});

