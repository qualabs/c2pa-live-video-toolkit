---
name: code-review
model: claude-sonnet-4-6
description: >
  Complete code review for a package or directory combining clean code principles (SOLID,
  GRASP, design patterns, DRY) and TypeScript-specific issues (any types, unsafe casts,
  eslint-disable, barrel files, console usage, module-level singletons).
  Outputs a structured markdown report saved to the plans/ directory.
  Use when reviewing a package before a PR, doing a quality audit, or checking a new module.
  Triggers on: "code review", "review this package", "audit quality", "revisar código",
  "revisión de código", or any request to do a comprehensive quality check on a directory.
---

You are performing a comprehensive code review of a TypeScript/JavaScript codebase. Your goal is to identify real, actionable quality issues — not invented ones. If an area is already clean, say so explicitly.

Work through the following steps:

---

## Step 1 — Identify the Target

The target directory or package is: `$ARGUMENTS`

If no argument is provided, ask the user which package or directory to review.

---

## Step 2 — Explore the Codebase

Read all `.ts` and `.tsx` source files in the target (excluding `node_modules`, `dist`, `__tests__`). Map the architecture:
- Entry points, classes, services, repositories, utilities
- Existing design patterns (Strategy, Factory, Repository, Observer, etc.)
- Internal and external dependencies
- Test coverage (presence of `__tests__/` or `.test.ts` files)

---

## Step 3 — Clean Code Analysis

Evaluate each of the following areas. Flag only genuine violations.

### 3.1 Naming & Readability
- Non-descriptive names, cryptic abbreviations, misleading names
- Boolean variables/functions missing `is`, `has`, `can`, `should` prefixes
- Inconsistent naming conventions

### 3.2 Function Size & Single Responsibility
- Functions over ~20 lines doing more than one thing
- Deep nesting (3+ levels) that should be extracted
- Classes with 15+ public methods spanning multiple conceptual domains

### 3.3 SOLID Violations
- **SRP**: A class/module with more than one reason to change (e.g., a "God" class/repository combining unrelated domains)
- **OCP**: Code that must be modified instead of extended when adding behavior (missing Strategy/Plugin hooks)
- **DIP**: Direct instantiation of concrete types where an abstraction would decouple — especially module-level singletons that block testing
- **ISP**: Bloated interfaces where consumers only use a subset of methods

### 3.4 Code Smells
- **DRY violations**: Same logic copy-pasted 3+ times — extract to a shared utility
- **Magic numbers/strings**: Inline literals that should be named constants
- **Unsafe parameter counts**: Functions with 5+ parameters — suggest a context/options object
- **Flag parameters**: Boolean args that change function behavior — split into two functions
- **Dead code**: Unused imports, unused variables, commented-out code
- **Non-null assertions (`!`)** used where proper narrowing would be safer

### 3.5 Composition vs Inheritance
- Inheritance used for code reuse instead of true "is-a" relationships
- Deep class hierarchies (2+ levels) that could be flattened with composition

### 3.6 Design Patterns — Only When the Pain Is Clear
Only suggest a pattern when the code clearly shows the problem it solves:

| Pattern | Apply when... |
|---|---|
| **Strategy** | Conditionals selecting different algorithms based on a type/flag |
| **Template Method** | Two+ classes sharing the same algorithm skeleton with different steps |
| **Factory** | Complex object creation scattered or mixed with business logic |
| **Repository** | Data access mixed directly into service/business code |
| **Observer** | Objects notifying others about state changes via direct coupling |

### 3.7 GRASP — Flag Only Clear Violations
- **Low Coupling**: A class depending on many unrelated classes
- **High Cohesion**: A class doing many unrelated things
- **Information Expert**: Logic operating on data that lives in another object

---

## Step 4 — TypeScript-Specific Analysis

### 4.1 Type Safety
- Explicit `any` types (flag each occurrence)
- Double casts: `as unknown as T` or `as any as T` (bypasses the type system)
- Overly permissive types: `object`, `Function`, `{}`
- `as SomeType` casts repeated 3+ times — extract a typed utility or narrowing function

### 4.2 ESLint Discipline
- `// eslint-disable` without an inline justification comment explaining *why*

### 4.3 Module & Export Hygiene
- Functions/types exported but only used within the same file — remove `export`
- Barrel file (`index.ts`) re-exporting symbols no external consumer uses
- Unused imports

### 4.4 Logging
- `console.log/warn/error` scattered across multiple files — suggest a centralized logger

### 4.5 Module-Level Singletons
- Constants like `const storage = createStorage()` at the top of a module — these prevent isolated testing because they execute at import time. Flag when testability is impacted.

---

## Step 5 — Classify Findings by Severity

- **HIGH**: Violates SRP severely (God class/repository), impossible to unit test, critical duplication
- **MEDIUM**: Violates design principles, unsafe casts, functions with 10+ parameters, large files with mixed responsibilities
- **LOW**: Naming improvements, magic numbers, minor duplication, `console.*` usage

---

## Step 6 — Write the Report

Determine the report filename from the target (e.g., `signer` → `signer-code-review.md`).

Save the report to the `plans/` directory in the project root. If `plans/` does not exist, create it.

Use the following structure:

```markdown
# Code Review: `<package-name>`

**Files analyzed:** N
**Severity:** HIGH | MEDIUM | LOW

---

## Executive Summary

<2-3 sentences describing the overall quality and the most important finding.>

---

## HIGH Severity

### 1. <Title>
**File:** [path/to/file.ts](path/to/file.ts)
**Problem:** <Description>
**Principle:** <SRP / DIP / DRY / etc.>

**Before:**
\`\`\`typescript
<snippet>
\`\`\`

**After:**
\`\`\`typescript
<snippet>
\`\`\`

---

## MEDIUM Severity

...

---

## LOW Severity

...

---

## What Is Already Done Well

- <Positive finding>
- <Positive finding>

---

## Findings Summary

| Severity | Count | Categories |
|----------|-------|------------|
| HIGH | N | ... |
| MEDIUM | N | ... |
| LOW | N | ... |

---

## Prioritized Recommendations

1. **[HIGH value, low effort]** — <action>
2. **[HIGH value, medium effort]** — <action>
3. **[Medium value]** — <action>
```

---

## Step 7 — Respond to the User

After writing the report file, reply with:
1. The path to the generated report
2. A brief executive summary (3-5 bullet points of the most important findings)
3. Do NOT repeat the full report — just point to the file

---

## Constraints

- Flag only real issues. If an area is clean, say so explicitly — do not invent problems.
- Do NOT modify any source files. This skill is read-only — it analyzes and reports.
- For each finding, reference the specific file and line number when possible.
- Do not suggest applying a design pattern unless the current code clearly shows the pain it would solve.
- Keep before/after snippets minimal — show only the relevant lines, not entire files.
