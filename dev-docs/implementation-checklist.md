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
- [x] Review simplified analysis document
- [x] Confirm simplified implementation approach

## Phase 1: Port-Specific PID/Log Files + Auto Port Selection

### Code Changes

- [x] **`server/cli/daemon.js`**
  - [x] Update `getPidFilePath(port)` to accept optional port parameter
    - [x] Return `server-{port}.pid` when port provided
    - [x] Return `server.pid` when port is null/undefined (backward compat)
  - [x] Update `getLogFilePath(port)` to accept optional port parameter
    - [x] Return `daemon-{port}.log` when port provided
    - [x] Return `daemon.log` when port is null/undefined (backward compat)
  - [x] Update `readPidFile(port)` to accept optional port parameter
  - [x] Update `writePidFile(pid, port)` to accept optional port parameter
  - [x] Update `removePidFile(port)` to accept optional port parameter
  - [x] Add `findAvailablePort(startPort)` helper function
    - [x] Check if port is available using `net.createServer()`
    - [x] If not available, try next port (startPort + 1, startPort + 2, etc.)
    - [x] Return first available port (max 10 attempts)
    - [x] Used by both global and new-instance modes

- [x] **`server/cli/commands.js`**
  - [x] Update `handleStart(options)` to accept `new_instance` flag
    - [x] **Auto port selection**: If no port specified, call `findAvailablePort(3000)`
    - [x] For `new_instance === true`: Start from port 3001 if global instance on 3000
    - [x] For `new_instance === false`: Start from port 3000 (default)
    - [x] When `new_instance === true`, pass port to PID/log functions
    - [x] When `new_instance === false`, use default behavior (no port)
  - [x] Update `handleStop(options)` to accept optional port parameter

- [x] **`server/cli/index.js`**
  - [x] Add `--new-instance` flag parsing in `parseArgs()`
  - [x] Pass `new_instance` flag to `handleStart()` options

### Tests

- [x] **`server/cli/daemon.test.js`**
  - [x] Test `getPidFilePath()` without port returns `server.pid`
  - [x] Test `getPidFilePath(3000)` returns `server-3000.pid`
  - [x] Test `getLogFilePath()` without port returns `daemon.log`
  - [x] Test `getLogFilePath(8080)` returns `daemon-8080.log`
  - [x] Test `findAvailablePort(3000)` returns 3000 when available
  - [x] Test `findAvailablePort(3000)` returns 3001 when 3000 is taken
  - [x] Test `findAvailablePort(3000)` tries up to 10 ports

- [x] **`server/cli/commands-phase1.test.js`**
  - [x] Test `handleStart()` without `new_instance` uses default PID file
  - [x] Test `handleStart({ new_instance: true })` auto-selects port 3001 if 3000 taken
  - [x] Test `handleStart({ new_instance: true, port: 3000 })` uses specified port
  - [x] Test `handleStart()` auto-selects port if 3000 is taken (global mode)
  - [x] Test backward compatibility: existing behavior unchanged

### Verification

- [x] Run unit tests: `npm test`
- [x] Run type checks: `npm run tsc`
- [x] Run linter: `npm run lint`
- [x] Manual test: Start server without `--new-instance`, verify default behavior
- [x] Manual test: Start server with `--new-instance` from different folder, verify port-specific files

## Phase 2: Instance Registry

### Code Changes

- [x] **`server/cli/instance-registry.js`** (NEW FILE)
  - [x] Create `getRegistryPath()` - returns `~/.beads-ui/instances.json`
  - [x] Create `readInstanceRegistry()` - read and parse JSON, return array
  - [x] Create `writeInstanceRegistry(instances)` - atomic write with temp file
  - [x] Create `registerInstance({ workspace, port, pid })` - add/update entry
  - [x] Create `unregisterInstance(port)` - remove entry by port
  - [x] Create `findInstanceByWorkspace(workspace)` - find by workspace path
  - [x] Create `findInstanceByPort(port)` - find by port
  - [x] Create `cleanStaleInstances()` - remove entries for dead processes
  - [x] Add JSDoc types for all functions

- [x] **`server/cli/commands.js`**
  - [x] Import instance registry functions
  - [x] Update `handleStart()` to:
    - [x] Register instance when `new_instance === true`
    - [x] Silently clean up orphaned instance for current workspace (if exists)
    - [x] Use the same port if orphan found and cleaned
  - [x] Update `handleStop()` to:
    - [x] **Always** unregister instance (whether process is running or not)
    - [x] Remove PID file
    - [x] No error if process is already dead (self-healing)

### Tests

- [x] **`server/cli/instance-registry.test.js`** (NEW FILE)
  - [x] Test `readInstanceRegistry()` with missing file returns empty array
  - [x] Test `readInstanceRegistry()` with valid JSON returns parsed data
  - [x] Test `readInstanceRegistry()` with corrupted JSON returns empty array
  - [x] Test `writeInstanceRegistry()` creates file with correct structure
  - [x] Test `registerInstance()` adds new entry
  - [x] Test `registerInstance()` updates existing entry (same port)
  - [x] Test `unregisterInstance()` removes entry
  - [x] Test `findInstanceByWorkspace()` finds exact match
  - [x] Test `findInstanceByWorkspace()` finds parent workspace
  - [x] Test `findInstanceByPort()` finds by port
  - [x] Test `cleanStaleInstances()` removes dead processes
  - [x] Test `cleanStaleInstances()` keeps alive processes

- [x] **`server/cli/commands-phase2.test.js`** (NEW FILE)
  - [x] Test `handleStart()` uses port-specific PID file when `new_instance` is true
  - [x] Test `handleStart()` uses default PID file when `new_instance` is false
  - [x] Test `handleStart()` starts from port 3001 when global instance running
  - [x] Test `handleStart()` reuses port from orphaned instance
  - [x] Test `handleStart()` registers instance when `new_instance` is true
  - [x] Test `handleStart()` does not register when `new_instance` is false
  - [x] Test `handleStop()` uses port-specific PID file when port specified
  - [x] Test `handleStop()` uses default PID file when no port specified
  - [x] Test `handleStop()` unregisters instance from registry
  - [x] Test `handleStop()` unregisters even when process not running (self-healing)

- [x] **Updated existing tests**
  - [x] Updated `commands.unit.test.js` for self-healing behavior
  - [x] Updated `commands.integration.test.js` for self-healing behavior
  - [x] Removed `commands-phase1.test.js` (functionality covered by phase2 tests)

### Verification

- [x] Run unit tests: `npm test` (77 tests pass)
- [x] Run type checks: `npm run tsc`
- [x] Run linter: `npm run lint`
- [x] Manual test: Default instance on port 3000 (not in registry)
- [x] Manual test: New instance in beads-ui on port 3005 (in registry)
- [x] Manual test: New instance in ../beads on port 3001 (separate workspace)
- [x] Manual test: New instance in ../gastown on port 3002 (separate workspace)
- [x] Manual test: Starting new instance in same workspace stops old one first
- [x] Manual test: Orphaned instance detection and port reuse works
- [x] Playwright test: All instances verified working on their respective ports

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
