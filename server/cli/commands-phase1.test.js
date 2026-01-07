import { describe, expect, test, vi } from 'vitest';
import { handleStart, handleStop } from './commands.js';
import * as daemon from './daemon.js';

// Mock open.js to avoid external effects
vi.mock('./open.js', () => ({
  openUrl: async () => true,
  waitForServer: async () => {},
  registerWorkspaceWithServer: async () => true
}));

// Mock db resolution
vi.mock('../db.js', () => ({
  resolveDbPath: () => ({
    path: '/mock/test.db',
    source: 'nearest',
    exists: false
  })
}));

// Mock config
vi.mock('../config.js', () => ({
  getConfig: () => ({ url: 'http://127.0.0.1:3000' })
}));

describe('handleStart with --new-instance flag', () => {
  test('uses port-specific PID file when new_instance is true', async () => {
    const read_pid_spy = vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3001);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    await handleStart({ new_instance: true });

    // Should check for port-specific PID file (3001)
    expect(read_pid_spy).toHaveBeenCalledWith(3001);
  });

  test('uses default PID file when new_instance is false', async () => {
    const read_pid_spy = vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3000);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    await handleStart({ new_instance: false });

    // Should check for default PID file (no port)
    expect(read_pid_spy).toHaveBeenCalledWith(undefined);
  });

  test('finds available port when no port specified', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    const find_port_spy = vi
      .spyOn(daemon, 'findAvailablePort')
      .mockResolvedValue(3000);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    await handleStart({});

    expect(find_port_spy).toHaveBeenCalledWith(3000);
  });

  test('returns error when no available port found', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(null);

    const code = await handleStart({});

    expect(code).toBe(1);
  });

  test('starts from port 3001 for new instance when global instance running', async () => {
    // First call for global instance check
    vi.spyOn(daemon, 'readPidFile')
      .mockReturnValueOnce(12345) // global instance running
      .mockReturnValueOnce(null); // no instance on port 3001
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    const find_port_spy = vi
      .spyOn(daemon, 'findAvailablePort')
      .mockResolvedValue(3001);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 54321 });
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    await handleStart({ new_instance: true });

    expect(find_port_spy).toHaveBeenCalledWith(3001);
  });

  test('returns error when instance already running on port with new_instance', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3001);
    // Second readPidFile call returns existing PID
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    const code = await handleStart({ new_instance: true, port: 3001 });

    expect(code).toBe(1);
  });
});

describe('handleStop with port option', () => {
  test('uses port-specific PID file when port specified', async () => {
    const read_pid_spy = vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    const remove_pid_spy = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    await handleStop({ port: 3001 });

    expect(read_pid_spy).toHaveBeenCalledWith(3001);
    expect(remove_pid_spy).toHaveBeenCalledWith(3001);
  });

  test('uses default PID file when no port specified', async () => {
    const read_pid_spy = vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    const remove_pid_spy = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    await handleStop({});

    expect(read_pid_spy).toHaveBeenCalledWith(undefined);
    expect(remove_pid_spy).toHaveBeenCalledWith(undefined);
  });
});

