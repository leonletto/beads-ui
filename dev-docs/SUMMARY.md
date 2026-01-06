# Multi-Instance Feature - Updated Requirements Summary

## Overview

The multi-instance feature has been enhanced with additional requirements for instance management and orphan detection. This document summarizes the complete feature set.

## Core Requirements

### 1. Multi-Instance Support (`--new-instance` flag)
- Allow running multiple independent beads-ui servers on different ports
- Each instance serves one workspace
- Port-specific PID and log files
- Instance registry for tracking all running instances
- Fully backward compatible (opt-in via flag)

### 2. Remove Instance Command
- **Command**: `bdui remove-instance`
- **Purpose**: Clean up instance registry entries

**Use Cases**:
- Remove instance for current workspace: `bdui remove-instance`
- Remove instance by port: `bdui remove-instance --port 3000`
- Force removal (even if process dead): `bdui remove-instance --port 3000 --force`
- Clean up all orphans: `bdui remove-instance --cleanup-orphans`

**Safety Features**:
- Prevents removing running instances without `--force`
- Cleans up both registry entry and PID file
- Clear confirmation messages

### 3. Orphan Detection on Start
- **Trigger**: When running `bdui start --new-instance`
- **Detection**: Check if instance exists for workspace but process is dead
- **Action**: Auto-cleanup with clear warning message
- **User Experience**: Seamless recovery after system reboot

**Example Output**:
```
Warning: Found orphaned instance for this workspace
  Port: 3000
  PID: 12345 (not running)
  Workspace: /Users/me/project-a

Cleaning up orphaned instance...

beads db   /Users/me/project-a/.beads/issues.db (nearest)
beads ui   listening on http://127.0.0.1:3000
```

## Implementation Phases

### Phase 1: Port-Specific PID/Log Files
- Modify `daemon.js` to accept optional port parameter
- Update PID/log file naming: `server-{port}.pid`, `daemon-{port}.log`
- Maintain backward compatibility (no port = default files)
- **Estimated Time**: 1-2 hours

### Phase 2: Instance Registry
- Create `instance-registry.js` module
- Implement CRUD operations for `instances.json`
- Track: workspace path, port, PID, start time
- Automatic stale instance cleanup
- **Estimated Time**: 2-3 hours

### Phase 3: Enhanced Restart
- Auto-detect instance from workspace
- Support port-specific restart
- Maintain backward compatibility
- **Estimated Time**: 1-2 hours

### Phase 4: Remove Instance Command
- Implement `handleRemoveInstance()` command handler
- Support removal by workspace or port
- Add `--force` and `--cleanup-orphans` flags
- Safety checks for running instances
- **Estimated Time**: 1 hour

### Phase 5: Orphan Detection
- Detect orphaned instances on start
- Auto-cleanup with warning messages
- Handle post-reboot scenarios
- **Estimated Time**: 1 hour

### Phase 6: Documentation & Testing
- Update README and help text
- Write comprehensive tests
- Manual end-to-end testing
- **Estimated Time**: 2-3 hours

**Total Estimated Time**: 8-12 hours

## Key Design Decisions

1. **Backward Compatibility**: Default behavior unchanged, `--new-instance` is opt-in
2. **Port-Specific Files**: Enables true isolation between instances
3. **Instance Registry**: Single source of truth for all instances
4. **Auto-Cleanup**: Orphans are automatically cleaned up with clear warnings
5. **Safety First**: Prevent accidental removal of running instances

## New CLI Commands and Flags

### Commands
- `bdui start` - Start server (existing, enhanced)
- `bdui stop` - Stop server (existing, enhanced)
- `bdui restart` - Restart server (existing, enhanced)
- `bdui remove-instance` - Remove instance registry entry (NEW)

### Flags
- `--new-instance` - Start independent instance (NEW)
- `--force` - Force removal even if process dead (NEW)
- `--cleanup-orphans` - Remove all orphaned instances (NEW)
- `--port <num>` - Specify port (existing, enhanced)
- `--host <addr>` - Specify host (existing)
- `--open` - Open browser (existing)
- `--debug` - Enable debug logging (existing)

## Usage Examples

### Multi-Instance Workflow
```bash
# Start first instance
cd ~/project-a
bdui start --port 3000 --new-instance --open

# Start second instance
cd ~/project-b
bdui start --port 8080 --new-instance --open

# Restart by workspace (auto-detects port)
cd ~/project-a
bdui restart --new-instance

# Stop specific instance
bdui stop --port 3000

# Remove instance
cd ~/project-a
bdui remove-instance
```

### Orphan Cleanup Workflow
```bash
# After system reboot, instances are orphaned
cd ~/project-a
bdui start --new-instance
# Auto-detects and cleans up orphan, then starts fresh

# Or manually clean up all orphans
bdui remove-instance --cleanup-orphans
```

## Testing Strategy

### Unit Tests
- Port-specific PID/log file paths
- Instance registry CRUD operations
- Orphan detection logic
- Remove instance command
- Command flag parsing

### Integration Tests
- Multi-instance lifecycle
- Orphan detection and cleanup
- Remove instance scenarios
- Backward compatibility
- Edge cases (port conflicts, registry corruption)

### Manual Testing
- Full multi-instance workflow
- Post-reboot orphan cleanup
- Remove instance with various flags
- Backward compatibility verification

## Success Criteria

- ✅ Multiple instances run independently on different ports
- ✅ Instances survive across terminal sessions (daemon mode)
- ✅ Orphaned instances are detected and cleaned up automatically
- ✅ Users can manually remove instances with clear commands
- ✅ Backward compatibility maintained (existing workflows unchanged)
- ✅ Clear error messages and warnings guide users
- ✅ All tests pass (unit, integration, manual)
- ✅ Documentation is comprehensive and clear

## Files Modified/Created

### Modified
- `server/cli/daemon.js` - Port-specific PID/log files
- `server/cli/commands.js` - Enhanced start/stop/restart, new remove-instance
- `server/cli/index.js` - New command and flag parsing
- `server/cli/usage.js` - Updated help text

### Created
- `server/cli/instance-registry.js` - Instance registry management

### Tests
- `server/cli/instance-registry.test.js` - Registry unit tests
- Enhanced existing test files with new scenarios

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Port conflicts | Low | Medium | Existing server error handling |
| Orphaned instances | Medium | Low | Auto-cleanup on start |
| Registry corruption | Low | Low | Atomic writes, graceful fallback |
| Backward compat break | Low | High | Comprehensive tests, opt-in flag |

**Overall Risk**: LOW-MEDIUM

## Next Steps

1. Review and approve this updated design
2. Begin implementation following the checklist
3. Test each phase thoroughly before proceeding
4. Create PR with comprehensive documentation

