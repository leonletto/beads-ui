# Multi-Instance Feature - Development Documentation

This directory contains comprehensive planning and analysis documents for the
multi-instance feature.

## Documents

### 1. [diagrams.md](./diagrams.md)

**Visual architecture and flow diagrams**

- Multi-instance architecture overview
- Remove instance and orphan detection flows
- Instance registry data structure
- Usage flow examples with system responses

### 2. [multi-instance-analysis.md](./multi-instance-analysis.md)

**Comprehensive feasibility analysis and design document**

- Current architecture overview
- Proposed design with `--new-instance` flag
- Implementation complexity breakdown
- Testing strategy
- Risk assessment and mitigations
- Recommended implementation order

**Key Findings:**

- ✅ **Feasibility: HIGH** - Implementation is straightforward
- ⚙️ **Complexity: MEDIUM** - ~100 lines changed, ~120 lines added
- 🛡️ **Risk: LOW-MEDIUM** - Fully backward compatible
- ⏱️ **Estimated Time: 6-9 hours**

### 3. [implementation-checklist.md](./implementation-checklist.md)

**Detailed step-by-step implementation checklist**

Organized into phases:

- **Phase 1**: Port-specific PID/log files
- **Phase 2**: Instance registry
- **Phase 3**: Enhanced restart command
- **Phase 4**: Remove instance command
- **Phase 5**: Orphan detection
- **Phase 6**: Documentation and polish
- **Phase 7**: Testing & verification

Each phase includes:

- Code changes required
- Tests to write
- Verification steps

### 4. [code-examples.md](./code-examples.md)

**Code snippets and implementation examples**

Contains:

- Example implementations for each phase
- JSDoc type annotations
- Usage examples (single vs multi-instance)
- Remove instance and orphan detection examples
- Unit test examples

### 5. [SUMMARY.md](./SUMMARY.md)

**Executive summary of the complete feature**

Comprehensive overview including:

- Core requirements (multi-instance, remove-instance, orphan detection)
- Implementation phases with time estimates
- Key design decisions
- New CLI commands and flags
- Usage examples and workflows
- Testing strategy and success criteria
- Risk assessment

## Quick Start

1. **Review the diagrams**: Start with `diagrams.md` for visual overview
2. **Read the summary**: Check `SUMMARY.md` for complete feature overview
3. **Review the analysis**: Read `multi-instance-analysis.md` to understand the
   design
4. **Follow the checklist**: Use `implementation-checklist.md` as your guide
5. **Reference examples**: Copy/adapt code from `code-examples.md`

## Architecture Diagrams

See `diagrams.md` for detailed visual diagrams including:

- Multi-instance architecture overview (current vs. proposed)
- Remove instance and orphan detection flows
- Instance registry data structure
- Usage flow examples with system responses

## Key Design Decisions

### 1. Backward Compatibility First

- Default behavior unchanged (single global instance)
- `--new-instance` is opt-in flag
- Existing workflows continue to work

### 2. Port-Specific PID Files

- `server.pid` → default (backward compatible)
- `server-3000.pid` → port-specific (new)
- `daemon.log` → default
- `daemon-3000.log` → port-specific (new)

### 3. Instance Registry

- New file: `~/.beads-ui/instances.json`
- Tracks: workspace path, port, PID, start time
- Enables intelligent restart: "restart the instance for this workspace"
- Automatic cleanup of stale entries

### 4. Enhanced Restart

- Without `--new-instance`: restart global instance (current behavior)
- With `--new-instance --port 3000`: restart specific port
- With `--new-instance` (no port): auto-detect from workspace

### 5. Remove Instance Command

- `bdui remove-instance`: Remove instance for current workspace
- `bdui remove-instance --port 3000 --force`: Force remove by port
- `bdui remove-instance --cleanup-orphans`: Clean up all orphaned instances
- Safety checks prevent removing running instances without `--force`

### 6. Orphan Detection

- Automatic detection on `bdui start --new-instance`
- Clear warning messages with helpful instructions
- Auto-cleanup of orphaned instances
- Handles post-reboot scenarios gracefully

## Usage Examples

### Current Behavior (Unchanged)

```bash
cd ~/project-a
bdui start --open              # Start on port 3000

cd ~/project-b
bdui start                     # Register with running server

bdui restart                   # Restart global instance
bdui stop                      # Stop global instance
```

### New Multi-Instance Behavior

```bash
cd ~/project-a
bdui start --port 3000 --new-instance --open

cd ~/project-b
bdui start --port 8080 --new-instance --open

bdui restart --new-instance    # Auto-detect port from workspace
bdui stop --port 3000          # Stop specific instance

# Remove instance
bdui remove-instance           # Remove instance for current workspace
bdui remove-instance --port 3000 --force  # Force remove by port
bdui remove-instance --cleanup-orphans    # Clean up all orphans
```

### Orphan Detection Example

```bash
# After system reboot, all instances are orphaned
cd ~/project-a
bdui start --new-instance

# Output:
# Warning: Found orphaned instance for this workspace
#   Port: 3000
#   PID: 12345 (not running)
#   Workspace: /Users/me/project-a
#
# Cleaning up orphaned instance...
#
# beads db   /Users/me/project-a/.beads/issues.db (nearest)
# beads ui   listening on http://127.0.0.1:3000
```

## Testing Strategy

### Unit Tests

- Port-specific PID/log file paths
- Instance registry CRUD operations
- Stale instance cleanup
- Command flag parsing

### Integration Tests

- Multi-instance lifecycle (start, stop, restart)
- Remove instance scenarios
- Orphan detection and cleanup
- Backward compatibility verification
- Edge cases (port conflicts, stale PIDs, registry corruption)

### Manual Testing

- Full workflow with 2+ instances
- Verify isolation between instances
- Test restart intelligence
- Test orphan detection after reboot
- Test remove-instance command
- Verify backward compatibility

## Implementation Timeline

| Phase     | Description                 | Estimated Time |
| --------- | --------------------------- | -------------- |
| 1         | Port-specific PID/log files | 1-2 hours      |
| 2         | Instance registry           | 2-3 hours      |
| 3         | Enhanced restart            | 1-2 hours      |
| 4         | Remove instance command     | 1 hour         |
| 5         | Orphan detection            | 1 hour         |
| 6         | Documentation & polish      | 1 hour         |
| 7         | Testing & verification      | 1-2 hours      |
| **Total** |                             | **8-12 hours** |

## Next Steps

1. ✅ Review analysis and approve design
2. ⬜ Implement Phase 1 (port-specific files)
3. ⬜ Implement Phase 2 (instance registry)
4. ⬜ Implement Phase 3 (enhanced restart)
5. ⬜ Implement Phase 4 (remove instance command)
6. ⬜ Implement Phase 5 (orphan detection)
7. ⬜ Write comprehensive tests
8. ⬜ Update documentation
9. ⬜ Create pull request

## Questions & Decisions

### Resolved

- ✅ Use `--new-instance` flag (not `--independent` or `--isolated`)
- ✅ Port-specific PID files (not workspace-specific)
- ✅ Instance registry approach (not PID file scanning)
- ✅ Backward compatibility is mandatory

### Open

- ⬜ Should `bdui stop` without args stop all instances or just default?
- ⬜ Should we add `bdui list` command to show all instances?
- ⬜ Should we add `bdui stop --all` to stop all instances?

## Notes

- This directory (`/output`) is excluded from git via `.git/info/exclude`
- All planning documents are for internal use during development
- Final documentation will be added to README.md and help text
