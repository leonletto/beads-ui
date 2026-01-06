# Multi-Instance Implementation Checklist

## Overview

This checklist implements the simplified multi-instance design:
- **One new flag**: `--new-instance`
- **No new commands**: Registry cleanup folded into `stop`
- **Self-healing**: Automatic orphan cleanup
- **Invisible registry**: Internal implementation detail only

## Prerequisites

- [x] Feature branch created: `multi-instance-dev`
- [x] Dev docs folder created: `dev-docs/`
- [ ] Review simplified analysis document
- [ ] Confirm simplified implementation approach

## Phase 1: Port-Specific PID/Log Files

### Code Changes

- [ ] **`server/cli/daemon.js`**
  - [ ] Update `getPidFilePath(port)` to accept optional port parameter
    - [ ] Return `server-{port}.pid` when port provided
    - [ ] Return `server.pid` when port is null/undefined (backward compat)
  - [ ] Update `getLogFilePath(port)` to accept optional port parameter
    - [ ] Return `daemon-{port}.log` when port provided
    - [ ] Return `daemon.log` when port is null/undefined (backward compat)
  - [ ] Update `readPidFile(port)` to accept optional port parameter
  - [ ] Update `writePidFile(pid, port)` to accept optional port parameter
  - [ ] Update `removePidFile(port)` to accept optional port parameter

- [ ] **`server/cli/commands.js`**
  - [ ] Update `handleStart(options)` to accept `new_instance` flag
    - [ ] When `new_instance === true`, pass port to PID/log functions
    - [ ] When `new_instance === false`, use default behavior (no port)
  - [ ] Update `handleStop(options)` to accept optional port parameter

- [ ] **`server/cli/index.js`**
  - [ ] Add `--new-instance` flag parsing in `parseArgs()`
  - [ ] Pass `new_instance` flag to `handleStart()` options

### Tests

- [ ] **`server/cli/daemon.test.js`**
  - [ ] Test `getPidFilePath()` without port returns `server.pid`
  - [ ] Test `getPidFilePath(3000)` returns `server-3000.pid`
  - [ ] Test `getLogFilePath()` without port returns `daemon.log`
  - [ ] Test `getLogFilePath(8080)` returns `daemon-8080.log`

- [ ] **`server/cli/commands-mi.test.js`**
  - [ ] Test `handleStart()` without `new_instance` uses default PID file
  - [ ] Test `handleStart({ new_instance: true, port: 3000 })` uses port-specific PID file
  - [ ] Test backward compatibility: existing behavior unchanged

### Verification

- [ ] Run unit tests: `npm test`
- [ ] Run type checks: `npm run tsc`
- [ ] Run linter: `npm run lint`
- [ ] Manual test: Start server without `--new-instance`, verify default behavior
- [ ] Manual test: Start server with `--new-instance --port 3000`, verify port-specific files

## Phase 2: Instance Registry

### Code Changes

- [ ] **`server/cli/instance-registry.js`** (NEW FILE)
  - [ ] Create `getRegistryPath()` - returns `~/.beads-ui/instances.json`
  - [ ] Create `readInstanceRegistry()` - read and parse JSON, return array
  - [ ] Create `writeInstanceRegistry(instances)` - atomic write with temp file
  - [ ] Create `registerInstance({ workspace, port, pid })` - add/update entry
  - [ ] Create `unregisterInstance(port)` - remove entry by port
  - [ ] Create `findInstanceByWorkspace(workspace)` - find by workspace path
  - [ ] Create `findInstanceByPort(port)` - find by port
  - [ ] Create `cleanStaleInstances()` - remove entries for dead processes
  - [ ] Add JSDoc types for all functions

- [ ] **`server/cli/commands.js`**
  - [ ] Import instance registry functions
  - [ ] Update `handleStart()` to:
    - [ ] Register instance when `new_instance === true`
    - [ ] Silently clean up orphaned instance for current workspace (if exists)
  - [ ] Update `handleStop()` to:
    - [ ] **Always** unregister instance (whether process is running or not)
    - [ ] Remove PID file
    - [ ] No error if process is already dead (self-healing)

### Tests

- [ ] **`server/cli/instance-registry.test.js`** (NEW FILE)
  - [ ] Test `readInstanceRegistry()` with missing file returns empty array
  - [ ] Test `readInstanceRegistry()` with valid JSON returns parsed data
  - [ ] Test `readInstanceRegistry()` with corrupted JSON returns empty array
  - [ ] Test `writeInstanceRegistry()` creates file with correct structure
  - [ ] Test `registerInstance()` adds new entry
  - [ ] Test `registerInstance()` updates existing entry (same port)
  - [ ] Test `unregisterInstance()` removes entry
  - [ ] Test `findInstanceByWorkspace()` finds exact match
  - [ ] Test `findInstanceByWorkspace()` finds parent workspace
  - [ ] Test `findInstanceByPort()` finds by port
  - [ ] Test `cleanStaleInstances()` removes dead processes
  - [ ] Test `cleanStaleInstances()` keeps alive processes

### Verification

- [ ] Run unit tests: `npm test`
- [ ] Run type checks: `npm run tsc`
- [ ] Run linter: `npm run lint`
- [ ] Manual test: Start instance, verify registry entry created
- [ ] Manual test: Stop instance, verify registry entry removed
- [ ] Manual test: Kill process manually, verify stale cleanup works

## Phase 3: Smart Restart Command

### Code Changes

- [ ] **`server/cli/commands.js`**
  - [ ] Update `handleRestart(options)` logic:
    - [ ] If `port` specified, restart that specific port
    - [ ] Otherwise, check if instance exists for current workspace
    - [ ] If workspace instance found, restart that
    - [ ] Otherwise, fall back to default behavior (global instance)
  - [ ] Restart = stop (which unregisters) + start (which re-registers)
  - [ ] **No `--new-instance` flag needed** - automatically detects context!

### Tests

- [ ] **`server/cli/commands.integration.test.js`**
  - [ ] Test `restart` with workspace instance → restarts workspace instance
  - [ ] Test `restart` without workspace instance → restarts global instance
  - [ ] Test `restart --port 3000` → restarts specific port
  - [ ] Test backward compatibility: existing restart behavior unchanged

### Verification

- [ ] Run integration tests: `npm test`
- [ ] Manual test: Start instance with `--new-instance`, then `restart` (no flags) → works
- [ ] Manual test: Start global instance, then `restart` → works
- [ ] Manual test: Verify registry entry is updated with new PID after restart

## Phase 4: Testing & Documentation

### Comprehensive Testing

- [ ] **Unit Tests**
  - [ ] Test port-specific PID/log file paths
  - [ ] Test instance registry CRUD operations
  - [ ] Test registry corruption handling (graceful fallback)
  - [ ] Test atomic writes (temp file + rename)
  - [ ] Test `stop` always cleans up registry
  - [ ] Test `start` silently cleans up orphans
  - [ ] Test restart with workspace detection

- [ ] **Integration Tests**
  - [ ] Test multi-instance lifecycle (start, stop, restart)
  - [ ] Test backward compatibility (no `--new-instance` flag)
  - [ ] Test orphan cleanup after process kill
  - [ ] Test orphan cleanup after system reboot simulation
  - [ ] Test port conflicts
  - [ ] Test concurrent instance operations

- [ ] **Edge Cases**
  - [ ] Registry file missing (create new)
  - [ ] Registry file corrupted (fallback to empty)
  - [ ] PID file exists but process dead (clean up)
  - [ ] Multiple instances on different ports
  - [ ] Stop instance that's already stopped (no error)

### Documentation

- [ ] Update `README.md` with `--new-instance` flag documentation
- [ ] Update `server/cli/usage.js` with new flag in help text
- [ ] Add examples to README showing multi-instance usage
- [ ] Document that registry is an internal implementation detail
- [ ] Add migration guide (if needed)
- [ ] Update any existing documentation that mentions single-instance behavior

### Final Verification

- [ ] Run full test suite: `npm test`
- [ ] Run type checks: `npm run tsc`
- [ ] Run linter: `npm run lint`
- [ ] Run prettier: `npm run prettier:write`
- [ ] Manual end-to-end test: Full multi-instance workflow
- [ ] Manual end-to-end test: Orphan cleanup after reboot
- [ ] Test backward compatibility: Verify existing workflows unchanged
- [ ] Test on clean system (no existing PID files or registry)

### Additional Features (Optional - Future Enhancements)

- [ ] Add `bdui list` command to show all running instances
- [ ] Add `bdui stop --all` to stop all instances

## Pull Request Preparation

- [ ] Commit all changes with clear commit messages
- [ ] Squash commits if needed for clean history
- [ ] Write comprehensive PR description
- [ ] Include before/after examples
- [ ] Highlight simplifications (no new commands, self-healing design)
- [ ] List breaking changes (should be none)
- [ ] Request review from maintainer

## Success Criteria

- ✅ Multiple instances run independently on different ports
- ✅ Each instance serves one workspace
- ✅ Instances survive across terminal sessions (daemon mode)
- ✅ `stop` always cleans up registry (self-healing)
- ✅ `start` silently handles orphans (no user intervention)
- ✅ Backward compatibility maintained (existing workflows unchanged)
- ✅ Registry is invisible to users (internal implementation detail)
- ✅ All tests pass (unit, integration, manual)
- ✅ Documentation is clear and concise

## Notes

- **Keep backward compatibility as top priority**
- **Registry is an internal implementation detail** — users never interact with it
- **Self-healing design** — `stop` always cleans up, `start` silently handles orphans
- Add comprehensive tests for each phase
- Document any edge cases discovered during implementation
- Consider adding debug logging for troubleshooting
