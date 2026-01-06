# Multi-Instance Implementation Checklist

## Prerequisites

- [x] Feature branch created: `feat/multi-instance`
- [x] Output folder added to `.git/info/exclude`
- [ ] Review analysis document
- [ ] Confirm implementation approach

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
  - [ ] Update `handleRestart(options)` to accept `new_instance` flag

- [ ] **`server/cli/index.js`**
  - [ ] Add `--new-instance` flag parsing in `parseArgs()`
  - [ ] Pass `new_instance` flag to `handleStart()` options
  - [ ] Pass `new_instance` flag to `handleRestart()` options

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
  - [ ] Update `handleStart()` to register instance when `new_instance === true`
  - [ ] Update `handleStop()` to unregister instance when port-specific
  - [ ] Add `cleanStaleInstances()` call at start of each command

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

## Phase 3: Enhanced Restart Command

### Code Changes

- [ ] **`server/cli/commands.js`**
  - [ ] Update `handleRestart(options)` logic:
    - [ ] If `new_instance === true` and `port` specified, restart that port
    - [ ] If `new_instance === true` and no port, find instance for current workspace
    - [ ] If `new_instance === false`, use default behavior (global instance)
  - [ ] Add helper function `findInstanceToRestart(workspace, port)`

### Tests

- [ ] **`server/cli/commands.integration.test.js`**
  - [ ] Test restart without `--new-instance` restarts global instance
  - [ ] Test restart with `--new-instance --port 3000` restarts port 3000
  - [ ] Test restart with `--new-instance` (no port) finds workspace instance
  - [ ] Test restart when no instance found returns error

### Verification

- [ ] Run integration tests: `npm test`
- [ ] Manual test: Start instance on port 3000, restart it, verify same port
- [ ] Manual test: Start instance, cd to workspace, restart without port, verify works

## Phase 4: Remove Instance Command

### Code Changes

- [ ] **`server/cli/commands.js`**
  - [ ] Create `handleRemoveInstance(options)` function
    - [ ] Accept `{ port?: number, force?: boolean, cleanup_orphans?: boolean }`
    - [ ] If no port: find instance for current workspace
    - [ ] If port specified: find instance by port
    - [ ] If force: skip process running check
    - [ ] If cleanup_orphans: remove all dead instances
    - [ ] Remove registry entry
    - [ ] Remove PID file if exists
    - [ ] Show confirmation message

- [ ] **`server/cli/index.js`**
  - [ ] Add `remove-instance` command parsing
  - [ ] Add `--force` flag parsing
  - [ ] Add `--cleanup-orphans` flag parsing
  - [ ] Dispatch to `handleRemoveInstance()`

- [ ] **`server/cli/instance-registry.js`**
  - [ ] Add `getAllOrphanedInstances()` - returns instances with dead processes
  - [ ] Add `removeInstanceByWorkspace(workspace)` - remove by workspace path
  - [ ] Add `removeInstanceByPort(port)` - remove by port

### Tests

- [ ] **`server/cli/commands-mi.test.js`**
  - [ ] Test `handleRemoveInstance()` removes instance for current workspace
  - [ ] Test `handleRemoveInstance({ port: 3000 })` removes by port
  - [ ] Test `handleRemoveInstance({ force: true })` removes even if running
  - [ ] Test `handleRemoveInstance({ cleanup_orphans: true })` removes all orphans
  - [ ] Test error when instance not found
  - [ ] Test error when trying to remove running instance without --force

- [ ] **`server/cli/instance-registry.test.js`**
  - [ ] Test `getAllOrphanedInstances()` finds dead processes
  - [ ] Test `removeInstanceByWorkspace()` removes correct entry
  - [ ] Test `removeInstanceByPort()` removes correct entry

### Verification

- [ ] Run unit tests: `npm test`
- [ ] Manual test: Register instance, remove it, verify registry cleaned
- [ ] Manual test: Remove with --force, verify works even if process dead
- [ ] Manual test: Remove with --cleanup-orphans, verify all orphans removed

## Phase 5: Orphan Detection on Start

### Code Changes

- [ ] **`server/cli/commands.js`**
  - [ ] Update `handleStart(options)` to detect orphans
    - [ ] Before starting, check if instance exists for workspace
    - [ ] If exists and process is dead, show warning
    - [ ] Auto-cleanup orphaned instance
    - [ ] Continue with normal start
  - [ ] Add helper function `detectAndCleanOrphan(workspace)`

- [ ] **`server/cli/instance-registry.js`**
  - [ ] Add `isInstanceOrphaned(instance)` - check if process is dead
  - [ ] Update `cleanStaleInstances()` to return list of cleaned instances

### Tests

- [ ] **`server/cli/commands.integration.test.js`**
  - [ ] Test start detects orphaned instance and cleans it up
  - [ ] Test start shows warning message for orphan
  - [ ] Test start continues normally after cleanup
  - [ ] Test start with no orphan works normally

### Verification

- [ ] Run integration tests: `npm test`
- [ ] Manual test: Register instance, kill process, start again, verify cleanup
- [ ] Manual test: Verify warning message is clear and helpful
- [ ] Manual test: After reboot, start instances, verify orphan cleanup

## Phase 6: Documentation and Polish

### Documentation

- [ ] Update `README.md` with `--new-instance` flag documentation
- [ ] Update `README.md` with `remove-instance` command documentation
- [ ] Update `server/cli/usage.js` with new flags and commands in help text
- [ ] Add examples to README showing multi-instance usage
- [ ] Add examples showing orphan cleanup workflow
- [ ] Document instance registry file location and format

### Additional Features (Optional)

- [ ] Add `bdui list` command to show all running instances
- [ ] Add `bdui stop --all` to stop all instances
- [ ] Add `bdui stop --port <port>` to stop specific instance

### Final Verification

- [ ] Run full test suite: `npm test`
- [ ] Run type checks: `npm run tsc`
- [ ] Run linter: `npm run lint`
- [ ] Run prettier: `npm run prettier:write`
- [ ] Manual end-to-end test: Full multi-instance workflow
- [ ] Manual end-to-end test: Orphan detection and cleanup
- [ ] Manual end-to-end test: Remove instance scenarios
- [ ] Test backward compatibility: Verify existing workflows unchanged

## Pull Request Preparation

- [ ] Commit all changes with clear commit messages
- [ ] Squash commits if needed for clean history
- [ ] Write comprehensive PR description
- [ ] Include before/after examples
- [ ] List breaking changes (should be none)
- [ ] Request review from maintainer

## Notes

- Keep backward compatibility as top priority
- Add comprehensive tests for each phase
- Document any edge cases discovered during implementation
- Consider adding debug logging for troubleshooting

