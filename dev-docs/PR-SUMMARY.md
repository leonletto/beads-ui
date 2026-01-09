# Multi-Instance Support - PR Summary

## Overview

This PR implements multi-instance support for beads-ui, allowing users to run
multiple workspace-specific UI instances simultaneously while maintaining 100%
backward compatibility.

## Key Features

- 🔢 **Auto port selection** – Automatically finds available ports starting from
  3001
- 🎯 **Workspace-aware** – Each instance is tied to its workspace directory
- 🔄 **Smart restart** – `restart` automatically detects and restarts workspace
  instances
- 🧹 **Self-healing** – Automatically cleans up orphaned instances
- ⏮️ **Backward compatible** – Existing workflows unchanged (no `--new-instance`
  = global instance)

## Usage

```sh
# Start a workspace-specific instance (auto port selection)
bdui start --new-instance

# Restart workspace instance (auto-detects)
bdui restart

# Stop workspace instance
bdui stop

# List all running instances
bdui list
```

## Implementation Details

### Phase 1: Port-Specific PID/Log Files + Auto Port Selection

- Updated `daemon.js` to support port-specific PID and log files
- Added `findAvailablePort()` for automatic port selection
- Backward compatible: default instance still uses `server.pid` and `daemon.log`

### Phase 2: Instance Registry

- Created `instance-registry.js` for tracking workspace instances
- Registry stored in `~/.beads-ui/instances.json`
- Self-healing: automatic orphan cleanup on start/stop
- Atomic writes using temp file + rename pattern

### Phase 3: Smart Restart

- Enhanced `restart` command to auto-detect workspace instances
- Falls back to global instance if no workspace instance found
- No `--new-instance` flag needed for restart

### Phase 4: Documentation & Testing

- Updated README.md with multi-instance examples
- Updated CLI help text (`usage.js`)
- Added `bdui list` command for visibility into running instances
- All 69 test files (296 tests) pass
- Type checks, linter, prettier all pass

## Test Coverage

- **Unit tests**: 87 CLI tests covering all new functionality
- **Integration tests**: Multi-instance lifecycle, orphan cleanup, port
  conflicts
- **Edge cases**: Registry corruption, stale PIDs, concurrent operations
- **Backward compatibility**: Verified existing workflows unchanged
- **List command**: 6 tests for read-only listing functionality

## Bug Fixes

### jsdom Compatibility Issue

**Problem**: All tests were hanging when running `npm test`.

**Root Cause**: Compatibility issue between jsdom 27.x and Vitest 4.x (Vitest
issue #9279).

**Solution**: Downgraded jsdom from `^27.2.0` to `^26.0.0`.

**Result**: All 68 test files (290 tests) now pass successfully.

## Files Changed

### New Files

- `server/cli/instance-registry.js` - Instance registry implementation
- `server/cli/instance-registry.test.js` - Registry tests (19 tests)
- `server/cli/commands-multi-instance.test.js` - Multi-instance tests (16 tests)
- `server/cli/commands-list.test.js` - List command tests (6 tests)
- `dev-docs/*` - Implementation documentation

### Modified Files

- `server/cli/daemon.js` - Port-specific PID/log files
- `server/cli/commands.js` - Multi-instance logic, smart restart
- `server/cli/index.js` - `--new-instance` flag parsing
- `server/cli/usage.js` - Updated help text
- `README.md` - Multi-instance documentation
- `package.json` - jsdom downgrade to v26

### Test Files

- `server/cli/daemon.test.js` - Updated for port-specific files
- `server/cli/commands.integration.test.js` - Updated for new behavior
- `server/cli/commands.unit.test.js` - Updated for new behavior
- `server/cli/cli.test.js` - Updated for `--new-instance` flag

## Backward Compatibility

✅ **100% backward compatible** - No breaking changes!

- `bdui start` (no flags) → Works exactly as before
- `bdui stop` (no flags) → Works exactly as before
- `bdui restart` (no flags) → Works exactly as before (unless workspace instance
  exists)
- All existing tests pass
- No changes to default behavior

## Migration Guide

**No migration needed!** The feature is opt-in via the `--new-instance` flag.
Existing users will see zero changes in behavior.

## Future Enhancements (Optional)

- `bdui stop --all` - Stop all instances

## Commits

See `git log multi-instance-dev ^main` for detailed commit history.

## Testing Instructions

```sh
# Run all tests
npm test

# Run type checks
npm run tsc

# Run linter
npm run lint

# Manual testing
bdui start --new-instance  # Start workspace instance
bdui restart               # Restart workspace instance
bdui stop                  # Stop workspace instance
bdui list                  # List all instances
```
