# Multi-Instance Feature - Final Design Summary

## Date: 2026-01-06

## Overview

This document summarizes the final simplified design for the multi-instance
feature, incorporating all feedback and refinements.

## Core Principles

1. **Simplicity First** - Minimize user-facing complexity
2. **Smart Defaults** - System should "just work" without manual intervention
3. **Backward Compatible** - Existing workflows unchanged
4. **Self-Healing** - Automatic cleanup and recovery
5. **Invisible Implementation** - Registry and internals hidden from users

## User-Facing Changes

### New Flag (Only One!)

- `--new-instance` - Start a new independent instance

### Enhanced Commands (No New Commands!)

- `bdui start` - Auto-selects port if 3000 is taken
- `bdui start --new-instance` - Auto-selects port, auto-cleans orphans
- `bdui stop --port <port>` - Always cleans up registry (self-healing)
- `bdui restart` - Smart context detection (no flags needed!)

## Key Features

### 1. Auto Port Selection

**No manual port management needed!**

```bash
# Just works - auto-selects port!
bdui start --new-instance
# Output: Using port 3001

# Another instance - auto-selects next port!
cd ~/another-project
bdui start --new-instance
# Output: Using port 3002
```

**How it works:**

- Global instance: Tries 3000, then 3001, 3002, etc.
- New instance: First tries to reuse orphan's port, then starts from 3001 if
  global is on 3000
- Tries up to 10 consecutive ports
- Users can still specify `--port` explicitly if desired

### 2. Smart Restart

**No `--new-instance` flag needed for restart!**

```bash
# Start instance
bdui start --new-instance
# Output: Using port 3001

# Later, restart - just works!
bdui restart
# Output: Restarting workspace instance on port 3001...
```

**How it works:**

1. If `--port` specified → restart that port
2. Otherwise, check if instance exists for workspace → restart that
3. Otherwise → restart global instance (backward compatible)

### 3. Self-Healing Stop

**Always cleans up, whether process is running or not!**

```bash
# Process was killed manually
bdui stop --port 3001
# Output: Server stopped.
# (Registry cleaned up automatically - no error!)
```

### 4. Silent Orphan Cleanup

**No user intervention needed after reboot!**

```bash
# After system reboot
bdui start --new-instance
# Output: Using port 3000
# (Orphan cleaned up silently - just works!)
```

## Implementation Complexity

| Metric                    | Value                |
| ------------------------- | -------------------- |
| **New Commands**          | 0                    |
| **New Flags**             | 1 (`--new-instance`) |
| **Lines Added**           | ~150                 |
| **Lines Changed**         | ~120                 |
| **Implementation Phases** | 4 + testing          |
| **Estimated Time**        | 6-8 hours            |
| **Risk Level**            | LOW                  |

## Implementation Phases

1. **Phase 1**: Port-specific PID/log files + Auto port selection
2. **Phase 2**: Instance registry (internal implementation)
3. **Phase 3**: Smart restart (automatic context detection)
4. **Phase 4**: Testing & documentation

## Success Criteria

- ✅ Multiple instances run independently
- ✅ Auto port selection works seamlessly
- ✅ Smart restart detects workspace context
- ✅ Self-healing stop always cleans up
- ✅ Silent orphan cleanup after reboot
- ✅ Backward compatibility maintained
- ✅ Registry is invisible to users
- ✅ All tests pass

## User Experience Examples

### Example 1: Multi-Instance Workflow

```bash
# Project A
cd ~/project-a
bdui start --new-instance
# Using port 3001

# Project B
cd ~/project-b
bdui start --new-instance
# Using port 3002

# Restart project A
cd ~/project-a
bdui restart
# Restarting workspace instance on port 3001...

# Stop project B
bdui stop --port 3002
# Server stopped.
```

### Example 2: After System Reboot

```bash
# All instances are orphaned after reboot
# project-a was previously on port 3001
cd ~/project-a
bdui start --new-instance
# Reusing port 3001 from previous instance
# (Orphan cleaned up silently, same port reused)

# project-b was previously on port 3002
cd ~/project-b
bdui start --new-instance
# Reusing port 3002 from previous instance
# (Orphan cleaned up silently, same port reused)

# Everything just works - same ports as before!
```

### Example 3: Global Instance (Backward Compatible)

```bash
# Start global instance
bdui start
# Using port 3000 (or 3001 if 3000 is taken)

# Register another workspace
cd ~/another-project
bdui start
# Workspace registered: /Users/me/another-project

# Restart global instance
bdui restart
# Server restarted.
```

## Key Simplifications

1. ✅ No `remove-instance` command
2. ✅ No `--force` flag
3. ✅ No `--cleanup-orphans` flag
4. ✅ No `--new-instance` flag for restart
5. ✅ No manual port management
6. ✅ Registry is invisible
7. ✅ Self-healing by default

## Documentation Files

- `dev-docs/multi-instance-analysis.md` - Detailed analysis
- `dev-docs/implementation-checklist.md` - Implementation tasks
- `output/simplified-code-examples.md` - Code examples
- `output/auto-port-selection.md` - Auto port selection details
- `output/smart-restart-feature.md` - Smart restart details
- `output/final-design-summary.md` - This document

## Next Steps

1. Review final design with maintainer
2. Get approval to proceed
3. Implement Phase 1 (PID/log files + auto port selection)
4. Implement Phase 2 (instance registry)
5. Implement Phase 3 (smart restart)
6. Implement Phase 4 (testing & documentation)
7. Submit PR for review

## Summary

The final design achieves maximum simplicity while providing powerful
multi-instance capabilities:

- **One flag** (`--new-instance`)
- **Zero new commands**
- **Smart defaults** (auto port selection, smart restart)
- **Self-healing** (automatic cleanup)
- **Invisible complexity** (registry hidden)

**Result:** A feature that "just works" without requiring users to understand
implementation details! 🎉
