# Multi-Instance Feature Analysis

## Executive Summary

**Goal**: Enable running multiple independent beads-ui server instances on different ports, each serving a different workspace.

**Current State**: Single global instance on port 3000, shared across all workspaces.

**Proposed Solution**: Add `--new-instance` flag to enable port-specific instances with isolated PID files and an instance registry (internal implementation detail).

**Feasibility**: ✅ **HIGH** - Implementation is straightforward with minimal risk.

**Complexity**: ⚙️ **MEDIUM** - ~80 lines changed, ~150 lines added across 4 files.

**Risk**: 🛡️ **LOW** - Fully backward compatible, opt-in feature, registry is invisible to users.

**Estimated Time**: ⏱️ **5-7 hours** including testing and documentation.

## Overview

This document analyzes the feasibility and implementation complexity of adding a `--new-instance` flag to enable running multiple independent beads-ui servers on different ports.

## Current Architecture

### Single Instance Design

The current implementation enforces a single daemon instance through:

1. **Global PID file**: `~/.beads-ui/server.pid` (or `$XDG_RUNTIME_DIR/beads-ui/server.pid`)
2. **Global log file**: `~/.beads-ui/daemon.log`
3. **Idempotent start**: When `bdui start` detects an existing PID, it registers the workspace with the running server instead of starting a new instance

### Key Components

- **`server/cli/daemon.js`**: PID/log file management, daemon spawning
- **`server/cli/commands.js`**: `handleStart()`, `handleStop()`, `handleRestart()` command handlers
- **`server/cli/index.js`**: CLI argument parsing and command dispatch
- **`server/config.js`**: Runtime configuration (host, port, paths)
- **`server/registry-watcher.js`**: Workspace registration (in-memory + file-based)

## Proposed Design: `--new-instance` Flag

### User Experience

```bash
# Default behavior (unchanged): register with existing server
cd ~/project-a
bdui start --port 3000

cd ~/project-b
bdui start  # Registers with server on port 3000

# New behavior: force new instance
cd ~/project-c
bdui start --port 8080 --new-instance  # Starts independent server on 8080
```

### Backward Compatibility

✅ **Fully backward compatible**
- Without `--new-instance`: existing behavior (single global instance)
- With `--new-instance`: new behavior (port-specific instances)

## Implementation Plan

### Phase 1: Port-Specific PID/Log Files

**Complexity: LOW** (~30 lines changed)

#### Changes Required

1. **`server/cli/daemon.js`**
   - Modify `getPidFilePath()` to accept optional port parameter
   - Modify `getLogFilePath()` to accept optional port parameter
   - Update file naming: `server-{port}.pid`, `daemon-{port}.log`
   - Keep default behavior when port is not specified (backward compatible)

2. **`server/cli/commands.js`**
   - Update `handleStart()` to pass port to PID/log file functions when `new_instance` flag is set
   - Update `handleStop()` to accept port parameter
   - Update `handleRestart()` to accept port parameter

3. **`server/cli/index.js`**
   - Add `--new-instance` flag parsing
   - Pass `new_instance` flag to command handlers

#### Example Implementation

```javascript
// daemon.js
export function getPidFilePath(port) {
  const runtime_dir = getRuntimeDir();
  const filename = port ? `server-${port}.pid` : 'server.pid';
  return path.join(runtime_dir, filename);
}

export function getLogFilePath(port) {
  const runtime_dir = getRuntimeDir();
  const filename = port ? `daemon-${port}.log` : 'daemon.log';
  return path.join(runtime_dir, filename);
}
```

### Phase 2: Instance Registry (Internal Implementation Detail)

**Complexity: MEDIUM** (~80 lines new code)

#### Purpose

The instance registry is an **internal implementation detail** that enables:
- Intelligent restart: "restart the instance for this workspace"
- Automatic cleanup on stop (no orphaned registry entries)
- Silent orphan detection and cleanup on start

**Users never interact with the registry directly** — it's managed automatically by `start`, `stop`, and `restart` commands.

#### Registry Structure

Create `~/.beads-ui/instances.json`:
```json
[
  {
    "workspace": "/Users/me/project-a",
    "port": 3000,
    "pid": 12345,
    "started_at": "2026-01-06T10:30:00Z"
  },
  {
    "workspace": "/Users/me/project-b",
    "port": 8080,
    "pid": 12346,
    "started_at": "2026-01-06T10:35:00Z"
  }
]
```

#### New Module: `server/cli/instance-registry.js`

Functions needed:
- `readInstanceRegistry()`: Read and parse instances.json
- `writeInstanceRegistry(instances)`: Write instances.json atomically
- `registerInstance(workspace, port, pid)`: Add/update instance entry
- `unregisterInstance(port)`: Remove instance entry
- `findInstanceByWorkspace(workspace)`: Find instance for current workspace
- `findInstanceByPort(port)`: Find instance by port
- `cleanStaleInstances()`: Remove entries for dead processes (silent cleanup)

#### Integration Points

1. **`handleStart()`**:
   - Register instance when starting with `--new-instance`
   - Silently clean up orphaned instance if found for this workspace

2. **`handleStop()`**:
   - **Always** unregister instance (whether process is running or not)
   - Remove PID file
   - This makes `stop` self-healing by default

3. **`handleRestart()`**:
   - Use registry to find which instance to restart
   - Stop (which unregisters) then start (which re-registers)

### Phase 3: Enhanced Stop Command

**Complexity: LOW** (~20 lines changed)

#### Key Design Decision

**`stop` always cleans up everything** — both the process AND the registry entry.

#### Behavior

```javascript
// bdui stop --port 3000
1. Look up instance in registry by port
2. If PID is running:
   - Send SIGTERM
   - Wait for graceful shutdown
3. If PID is NOT running:
   - Treat as orphan (no error)
4. In BOTH cases:
   - Remove PID file
   - Remove registry entry
```

This makes the system **self-healing** — users never see "stale instance" errors.

#### Changes Required

**`server/cli/commands.js`**:
- Modify `handleStop()` to always call `unregisterInstance(port)` after stopping
- No error if process is already dead (just clean up silently)

### Phase 4: Enhanced Restart Command

**Complexity: MEDIUM** (~30 lines changed)

#### Behavior (Smart Context Detection)

The `restart` command automatically detects context:
1. If `--port` specified → restart that specific port
2. Otherwise, check if instance exists for current workspace → restart that
3. Otherwise → fall back to default behavior (global instance)

**No `--new-instance` flag needed!** Just `bdui restart` and it works.

#### Changes Required

**`server/cli/commands.js`**:
- Modify `handleRestart()` to check registry for current workspace
- Auto-detect port from workspace if found
- Fall back to default behavior if no workspace instance found

## Implementation Complexity Summary

| Phase | Component | Lines Changed | Lines Added | Difficulty | Risk |
|-------|-----------|---------------|-------------|------------|------|
| 1 | Port-specific PID/log | ~30 | ~10 | LOW | LOW |
| 2 | Instance registry (internal) | ~20 | ~80 | MEDIUM | LOW |
| 3 | Enhanced stop (self-healing) | ~20 | ~10 | LOW | LOW |
| 4 | Enhanced restart logic | ~30 | ~20 | MEDIUM | LOW |
| **Total** | | **~100** | **~120** | **MEDIUM** | **LOW** |

**Key Simplifications:**
- No `remove-instance` command (registry cleanup folded into `stop`)
- No `--force` flag (stop always cleans up, whether process is running or not)
- No `--cleanup-orphans` flag (cleanup happens automatically)
- Registry is completely invisible to users

## Testing Strategy

### Unit Tests

1. **`daemon.test.js`**
   - Test port-specific PID file paths
   - Test port-specific log file paths
   - Test backward compatibility (no port = default behavior)

2. **`instance-registry.test.js`** (new)
   - Test registry CRUD operations
   - Test stale instance cleanup
   - Test concurrent access (atomic writes)

3. **`commands-mi.test.js`**
   - Test `--new-instance` flag handling
   - Test restart with instance detection
   - Test stop with port parameter

### Integration Tests

1. **Multi-instance lifecycle**
   - Start instance on port 3000
   - Start instance on port 8080
   - Verify both running independently
   - Stop port 3000, verify 8080 still running
   - Restart port 8080, verify it restarts correctly

2. **Backward compatibility**
   - Start without `--new-instance`, verify single instance behavior
   - Start second time, verify workspace registration (not new instance)

3. **Edge cases**
   - Port conflict detection
   - Stale PID file cleanup
   - Registry corruption recovery

## Risks and Mitigations

### Risk 1: Port Conflicts
**Scenario**: User tries to start instance on already-bound port
**Mitigation**: Server startup will fail with clear error message (existing behavior)

### Risk 2: Orphaned Instances
**Scenario**: Instance crashes, registry not cleaned up
**Mitigation**:
- `stop` always cleans up registry, even if process is dead (self-healing)
- `start` silently cleans up orphaned instances for the current workspace
- No user intervention required

### Risk 3: Registry Corruption
**Scenario**: instances.json becomes corrupted
**Mitigation**:
- Atomic writes with temp file + rename
- Graceful fallback to empty registry on parse error
- Log warnings for manual intervention

### Risk 4: Backward Compatibility Break
**Scenario**: Existing users' workflows break
**Mitigation**:
- Default behavior unchanged (no `--new-instance` = single instance)
- Comprehensive integration tests
- Clear migration guide in PR

## Recommended Implementation Order

1. ✅ **Create feature branch** `feat/multi-instance`
2. **Phase 1**: Port-specific PID/log files (1-2 hours)
   - Implement in `daemon.js`
   - Add unit tests
   - Verify backward compatibility
3. **Phase 3**: Instance registry (2-3 hours)
   - Create `instance-registry.js`
   - Add unit tests
   - Integration with start/stop
4. **Phase 2**: Enhanced restart (1-2 hours)
   - Update `handleRestart()` to use registry
   - Add integration tests
5. **Documentation**: Update README and help text (30 min)
6. **Final testing**: Full integration test suite (1 hour)

**Total estimated time: 6-9 hours**

## Additional Requirements

### 1. Remove Instance Command

**Requirement**: Add ability to remove instance registry entries

**Use Cases**:
- **Clean removal**: `bdui remove-instance` in workspace directory removes that instance
- **Force removal by port**: `bdui remove-instance --port 3000 --force` removes instance even if files are gone
- **Orphan cleanup**: Detect and warn about orphaned instances on `bdui start`

**Design**:

```bash
# Remove instance for current workspace
cd ~/project-a
bdui remove-instance

# Remove instance by port (requires --force if process not running)
bdui remove-instance --port 3000 --force

# Remove all orphaned instances
bdui remove-instance --cleanup-orphans
```

**Implementation Details**:

1. **`handleRemoveInstance(options)`** - New command handler
   - If no `--port`: Find instance for current workspace, remove it
   - If `--port` specified: Remove instance for that port
   - If `--force`: Skip process running check, just remove registry entry
   - If `--cleanup-orphans`: Scan registry, remove all entries with dead processes

2. **Orphan Detection on Start**:
   - When `bdui start --new-instance` runs, check if registry has entry for this workspace
   - If entry exists but process is dead, show warning:
     ```
     Warning: Found orphaned instance for this workspace (port 3000, PID 12345 not running)
     To remove it, run: bdui remove-instance
     ```
   - Auto-cleanup the orphan and continue with start

3. **Safety Checks**:
   - Without `--force`: Refuse to remove if process is still running
   - With `--force`: Remove registry entry and PID file regardless
   - Always clean up PID file when removing instance

### 2. Enhanced Orphan Handling

**Scenarios**:

1. **User deletes workspace files**: Registry entry remains, PID file may remain
2. **System reboot**: All processes dead, registry entries stale
3. **Manual process kill**: Process dead, registry and PID file remain

**Detection Strategy**:

```javascript
function detectOrphanedInstance(workspace, port) {
  const instance = findInstanceByWorkspace(workspace);
  if (!instance) return null;

  if (!isProcessRunning(instance.pid)) {
    return {
      workspace: instance.workspace,
      port: instance.port,
      pid: instance.pid,
      reason: 'process_not_running'
    };
  }

  return null;
}
```

**User Experience** (Silent Cleanup):

```bash
# After reboot, user tries to start
cd ~/project-a
bdui start --new-instance

# Output (orphan cleaned up silently):
# beads db   /Users/me/project-a/.beads/issues.db (nearest)
# beads ui   listening on http://127.0.0.1:3000
```

No warning needed — the system just works.

## Open Questions

1. **Should `bdui stop` without `--port` stop all instances or just the default?**
   - ✅ **RESOLVED**: Stop only the default instance (backward compatible)
   - Future: Could add `bdui stop --all` for stopping all instances

2. **Should we add `bdui list` to show all running instances?**
   - Future enhancement: Yes, very useful for debugging
   - Low complexity (~20 lines)
   - Not required for MVP

3. **Should instances auto-register their workspace on startup?**
   - ✅ **RESOLVED**: Yes, store workspace path in registry
   - Enables smart restart without requiring `--port` flag

4. **How to handle workspace switching in the UI with multiple instances?**
   - Current: UI has workspace picker for single server
   - With multi-instance: Each instance serves one workspace
   - ✅ **RESOLVED**: Keep current behavior, document that multi-instance = one workspace per server

## Conclusion

**Feasibility: HIGH** ✅

The proposed `--new-instance` feature is **highly feasible** with **medium complexity** and **low risk**. The implementation is well-scoped and maintains full backward compatibility.

**Key Success Factors:**
- Port-specific PID/log files enable independent instances
- Instance registry (internal detail) enables intelligent restart behavior
- Self-healing design: `stop` always cleans up, `start` silently handles orphans
- Backward compatibility preserved through opt-in flag
- Simplified design: only one new flag, no new commands
- Clear testing strategy reduces risk

**Recommendation: PROCEED** with implementation in the order outlined above.

## Design Simplification (2026-01-06)

### Key Simplifications Made

Following code review feedback, the design was simplified significantly:

1. **No `remove-instance` command**
   - Registry cleanup folded into `stop` command
   - `stop --port 3000` always cleans up both process AND registry entry
   - Self-healing by default

2. **No `--force` flag**
   - `stop` works whether process is running or not
   - No distinction needed — just clean up everything

3. **No `--cleanup-orphans` flag**
   - Orphan cleanup happens automatically and silently
   - `start` detects and cleans up orphans for current workspace
   - No user intervention required

4. **Registry is invisible to users**
   - Internal implementation detail only
   - Users never interact with it directly
   - No registry management concepts in documentation

### Updated Complexity Estimate

- **Lines Changed**: ~100 (down from ~130)
- **Lines Added**: ~120 (down from ~220)
- **Estimated Time**: 5-7 hours (down from 8-12 hours)
- **Difficulty**: MEDIUM (unchanged)
- **Risk**: LOW (down from LOW-MEDIUM)
- **New Commands**: 0 (down from 1)
- **New Flags**: 1 (`--new-instance` only)

### Benefits of Simplification

1. **Smaller PR**: Easier to review and approve
2. **Better UX**: System "just works" without user intervention
3. **Unix Philosophy**: `stop` means "make it gone" — simple and clear
4. **Less Documentation**: No registry concepts to explain
5. **Fewer Tests**: Simpler code paths to test
6. **Lower Risk**: Less surface area for bugs

### Implementation Priority

1. Phase 1: Port-specific PID/log files (foundation)
2. Phase 2: Instance registry (internal implementation)
3. Phase 3: Enhanced stop (self-healing cleanup)
4. Phase 4: Smart restart (automatic context detection)
5. Phase 5: Testing & documentation

**Total: 4 implementation phases + testing**

### Smart Restart Behavior

The `restart` command automatically detects context:
1. If `--port` specified → restart that specific port
2. Otherwise, check if instance exists for current workspace → restart that
3. Otherwise → fall back to default behavior (global instance)

**No `--new-instance` flag needed for restart!** Just `bdui restart` and it works.
