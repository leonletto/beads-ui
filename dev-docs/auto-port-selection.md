# Auto Port Selection Feature

## Overview

Both `bdui start` and `bdui start --new-instance` automatically find available
ports, eliminating the need for users to manually specify ports or deal with
port conflicts.

## How It Works

### For Global Instance (`bdui start`)

1. Tries port 3000 first (default)
2. If 3000 is taken, tries 3001
3. Continues trying consecutive ports (3002, 3003, etc.)
4. Stops after 10 attempts
5. Shows "Using port XXXX" message

### For New Instance (`bdui start --new-instance`)

1. **First, check for orphaned instance** for current workspace
2. If orphan found and its port is available → **Reuse that port**
3. Otherwise, check if global instance is running on port 3000
4. If yes, starts searching from port 3001
5. If no, starts searching from port 3000
6. Tries consecutive ports until one is available
7. Stops after 10 attempts
8. Shows "Using port XXXX" or "Reusing port XXXX from previous instance"

### Explicit Port (Optional)

Users can still specify a port explicitly:

```bash
bdui start --port 8080 --new-instance
```

## User Experience

### Before (Manual Port Management)

```bash
# User has to manually find available ports
bdui start --port 3000 --new-instance
# Error: Port 3000 is already in use

# Try again with different port
bdui start --port 3001 --new-instance
# Error: Port 3001 is already in use

# Try again...
bdui start --port 3002 --new-instance
# Success! (frustrating experience)
```

### After (Auto Port Selection + Port Reuse)

```bash
# Just works!
bdui start --new-instance
# Output: Using port 3001
# Success! (seamless experience)

# Start another instance
cd ~/another-project
bdui start --new-instance
# Output: Using port 3002
# Success!

# After reboot, orphan port is reused
cd ~/project-a  # Was previously on 3001
bdui start --new-instance
# Output: Reusing port 3001 from previous instance
# Success! (same port as before)
```

## Implementation

### `server/cli/daemon.js` - Helper Function

```javascript
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
```

### `server/cli/commands.js` - Integration

```javascript
export async function handleStart(options) {
  const new_instance = options?.new_instance === true;
  let port = options?.port;

  // Auto port selection if no port specified
  if (!port) {
    if (new_instance) {
      // Check for orphaned instance and try to reuse its port
      const cwd = process.cwd();
      const existing = findInstanceByWorkspace(cwd);

      if (existing && !isProcessRunning(existing.pid)) {
        // Orphan found - try to reuse its port if available
        const orphan_port_available = await findAvailablePort(existing.port);
        if (orphan_port_available === existing.port) {
          port = existing.port;
          console.log('Reusing port %d from previous instance', port);
        }
      }

      // If no orphan or port not available, find a new port
      if (!port) {
        const global_pid = readPidFile();
        const start_port =
          global_pid && isProcessRunning(global_pid) ? 3001 : 3000;
        port = await findAvailablePort(start_port);
        console.log('Using port %d', port);
      }
    } else {
      // For global instance, start from 3000
      port = await findAvailablePort(3000);
      console.log('Using port %d', port);
    }

    if (!port) {
      console.error('Could not find an available port (tried 3000-3009)');
      return 1;
    }
  }

  // ... rest of start logic
}
```

## Benefits

1. **No manual port management** - System finds available ports automatically
2. **No port conflicts** - Always finds an available port
3. **Better UX** - Users don't need to think about ports
4. **Works after reboot** - Seamlessly handles orphaned instances
5. **Port consistency** - Reuses same port after reboot for workspace
6. **Still flexible** - Users can specify `--port` explicitly if needed

## Edge Cases

### All Ports Taken (3000-3009)

```bash
bdui start --new-instance
# Output: Could not find an available port (tried 3000-3009)
# Exit code: 1
```

### User Specifies Taken Port

```bash
bdui start --port 3000 --new-instance
# Error: Port 3000 is already in use
# (Existing behavior - no auto-selection when port is explicit)
```

## Testing

### Unit Tests

- Test `findAvailablePort(3000)` returns 3000 when available
- Test `findAvailablePort(3000)` returns 3001 when 3000 is taken
- Test `findAvailablePort(3000)` tries up to 10 ports
- Test `findAvailablePort(3000)` returns null when all ports taken

### Integration Tests

- Test `start` auto-selects port when 3000 is taken
- Test `start --new-instance` auto-selects port starting from 3001
- Test `start --port 8080` uses explicit port (no auto-selection)
- Test error message when no ports available

## Summary

Auto port selection makes the multi-instance workflow seamless and
frustration-free. Users can focus on their work instead of managing port
numbers!
