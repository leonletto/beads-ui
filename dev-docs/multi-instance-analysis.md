# Multi-Instance Feature Analysis

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

### Phase 2: Enhanced Restart Command

**Complexity: MEDIUM** (~50 lines changed)

#### Current Behavior
- `bdui restart` stops the global instance and starts a new one
- No awareness of port or workspace

#### Proposed Behavior

**Without `--new-instance`**: Current behavior (restart global instance)

**With `--new-instance`**: 
1. Check if there's an instance running for this workspace+port
2. If yes, restart that specific instance
3. If no, start a new instance

#### Detection Strategy

**Option A: Instance Registry File** (RECOMMENDED)
- Create `~/.beads-ui/instances.json` mapping `{workspace_path, port}` → `{pid, started_at}`
- Update on start, clean up on stop
- Enables smart restart: "restart the instance for this workspace"

**Option B: PID File Scanning**
- Scan runtime dir for `server-*.pid` files
- Read each PID, check if process is running
- Match against current workspace (requires storing workspace path in PID file or separate metadata)

**Option C: Port-Only Matching**
- Simpler: just use port from `--port` flag or default
- Less intelligent but easier to implement

#### Recommended Approach: Option A

Create an instance registry that tracks:
```json
{
  "instances": [
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
}
```

**Benefits:**
- Enables intelligent restart: "restart the instance for this workspace"
- Supports `bdui stop --all` to stop all instances
- Supports `bdui list` to show all running instances
- Clean separation of concerns

### Phase 3: Instance Registry Management

**Complexity: MEDIUM** (~80 lines new code)

#### New Module: `server/cli/instance-registry.js`

Functions needed:
- `readInstanceRegistry()`: Read and parse instances.json
- `writeInstanceRegistry(instances)`: Write instances.json atomically
- `registerInstance(workspace, port, pid)`: Add/update instance entry
- `unregisterInstance(port)`: Remove instance entry
- `findInstanceByWorkspace(workspace)`: Find instance for current workspace
- `findInstanceByPort(port)`: Find instance by port
- `cleanStaleInstances()`: Remove entries for dead processes

#### Integration Points

1. **`handleStart()`**: Register instance when starting with `--new-instance`
2. **`handleStop()`**: Unregister instance when stopping
3. **`handleRestart()`**: Use registry to find which instance to restart

## Implementation Complexity Summary

| Phase | Component | Lines Changed | Lines Added | Difficulty | Risk |
|-------|-----------|---------------|-------------|------------|------|
| 1 | Port-specific PID/log | ~30 | ~10 | LOW | LOW |
| 2 | Instance registry | ~20 | ~80 | MEDIUM | LOW |
| 3 | Enhanced restart logic | ~50 | ~30 | MEDIUM | MEDIUM |
| 4 | Remove instance command | ~10 | ~60 | LOW | LOW |
| 5 | Orphan detection | ~20 | ~40 | LOW | LOW |
| **Total** | | **~130** | **~220** | **MEDIUM** | **LOW-MEDIUM** |

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
**Mitigation**: `cleanStaleInstances()` runs on every start/stop/restart

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

**User Experience**:

```bash
# After reboot, user tries to start
cd ~/project-a
bdui start --new-instance

# Output:
# Warning: Found orphaned instance for this workspace
#   Port: 3000
#   PID: 12345 (not running)
#   Workspace: /Users/me/project-a
#
# Cleaning up orphaned instance...
# Starting new instance on port 3000...
# beads ui   listening on http://127.0.0.1:3000
```

## Open Questions

1. **Should `bdui stop` without `--port` stop all instances or just the default?**
   - Recommendation: Stop only the default instance (backward compatible)
   - Add `bdui stop --all` for stopping all instances

2. **Should we add `bdui list` to show all running instances?**
   - Recommendation: Yes, very useful for debugging
   - Low complexity (~20 lines)

3. **Should instances auto-register their workspace on startup?**
   - ✅ **RESOLVED**: Yes, store workspace path in registry
   - Enables smart restart without requiring `--port` flag

4. **How to handle workspace switching in the UI with multiple instances?**
   - Current: UI has workspace picker for single server
   - With multi-instance: Each instance serves one workspace
   - Recommendation: Keep current behavior, document that multi-instance = one workspace per server

5. **Should orphan cleanup be automatic or require confirmation?**
   - Recommendation: Automatic cleanup with clear warning message
   - User can always use `--force` to override if needed

## Conclusion

**Feasibility: HIGH** ✅

The proposed `--new-instance` feature is **highly feasible** with **medium complexity** and **low-to-medium risk**. The implementation is well-scoped and maintains full backward compatibility.

**Key Success Factors:**
- Port-specific PID/log files enable independent instances
- Instance registry enables intelligent restart behavior
- Backward compatibility preserved through opt-in flag
- Clear testing strategy reduces risk

**Recommendation: PROCEED** with implementation in the order outlined above.

## Updated Requirements Summary (2026-01-06)

### Additional Features Added

1. **Remove Instance Command**
   - New command: `bdui remove-instance`
   - Supports removal by workspace or port
   - `--force` flag for removing dead instances
   - `--cleanup-orphans` flag for batch cleanup
   - Safety checks prevent accidental removal

2. **Orphan Detection on Start**
   - Automatic detection when starting with `--new-instance`
   - Clear warning messages with helpful context
   - Auto-cleanup of orphaned instances
   - Seamless recovery after system reboot

### Updated Complexity Estimate

- **Lines Changed**: ~130 (was ~100)
- **Lines Added**: ~220 (was ~120)
- **Estimated Time**: 8-12 hours (was 6-9 hours)
- **Difficulty**: MEDIUM (unchanged)
- **Risk**: LOW-MEDIUM (unchanged)

### Key Benefits of New Features

1. **Better User Experience**: Clear guidance when instances become orphaned
2. **Self-Healing**: Automatic cleanup reduces manual intervention
3. **Flexibility**: Multiple ways to remove instances (workspace, port, batch)
4. **Safety**: Prevents accidental removal of running instances
5. **Post-Reboot Recovery**: Seamless restart after system reboot

### Implementation Priority

1. Phase 1: Port-specific PID/log files (foundation)
2. Phase 2: Instance registry (core functionality)
3. Phase 5: Orphan detection (user experience)
4. Phase 4: Remove instance command (management)
5. Phase 3: Enhanced restart (convenience)
6. Phase 6: Documentation & testing (quality)

**Rationale**: Orphan detection (Phase 5) should come before remove-instance (Phase 4) because it provides immediate value and better UX. Users will rarely need to manually remove instances if auto-cleanup works well.
