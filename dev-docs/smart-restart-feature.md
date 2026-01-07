# Smart Restart Feature

## Overview

The `restart` command has been enhanced with **automatic context detection** to
provide the best user experience. No `--new-instance` flag needed!

## How It Works

When you run `bdui restart`, the system automatically:

1. **If `--port` specified** → Restart that specific port
2. **Otherwise, check current workspace** → If instance exists for workspace,
   restart that
3. **Otherwise** → Fall back to default behavior (restart global instance)

## User Experience

### Scenario 1: Multi-Instance Workflow

```bash
# Start instance for project-a
cd ~/project-a
bdui start --port 3000 --new-instance

# Later, need to restart
cd ~/project-a
bdui restart  # ✅ Automatically finds and restarts port 3000 instance!
```

### Scenario 2: Global Instance Workflow (Unchanged)

```bash
# Start global instance
cd ~/project-a
bdui start

# Later, need to restart
cd ~/project-b
bdui restart  # ✅ Restarts global instance (backward compatible)
```

### Scenario 3: Explicit Port

```bash
# Restart specific port explicitly
bdui restart --port 3000  # ✅ Restarts port 3000 instance
```

## Implementation

### Code Logic

```javascript
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

## Benefits

1. **Simpler UX** - Just `bdui restart` and it works!
2. **Context-aware** - Automatically detects workspace instance
3. **Backward compatible** - Existing workflows unchanged
4. **No extra flags** - No need to remember `--new-instance` for restart
5. **Intuitive** - Does what you expect based on context

## Comparison

| Scenario                   | Before (Original Design)                  | After (Smart Restart)         |
| -------------------------- | ----------------------------------------- | ----------------------------- |
| Restart workspace instance | `bdui restart --new-instance`             | `bdui restart` ✅             |
| Restart global instance    | `bdui restart`                            | `bdui restart` ✅             |
| Restart specific port      | `bdui restart --new-instance --port 3000` | `bdui restart --port 3000` ✅ |

## Testing

### Test Cases

1. **Test restart with workspace instance** → Restarts workspace instance
2. **Test restart without workspace instance** → Restarts global instance
3. **Test restart with explicit port** → Restarts specific port
4. **Test backward compatibility** → Existing restart behavior unchanged

### Manual Testing

```bash
# Test 1: Workspace instance restart
cd ~/project-a
bdui start --port 3000 --new-instance
bdui restart  # Should restart port 3000 instance

# Test 2: Global instance restart
cd ~/project-b
bdui start
bdui restart  # Should restart global instance

# Test 3: Explicit port restart
bdui restart --port 3000  # Should restart port 3000 instance
```

## Summary

The smart restart feature makes the multi-instance workflow feel natural and
intuitive. Users don't need to remember special flags - the system just works
based on context!

**Key Principle:** The tool should be smart enough to do the right thing based
on context, without requiring the user to specify extra flags.
