# Cleanup plan: `@c2pa-live-toolkit/videojs-ui`

Findings from code review. None of these are blocking — this is deferred tech debt.

---

## HIGH — Dead code

### 1. `LOCATION`, `WEBSITE`, `SOCIAL` extractors always return `null`

**File:** `src/components/MenuValueExtractor.ts`

The value extractors for these three menu items are permanently disabled:

```ts
[MenuItemKey.LOCATION]: () => null,
[MenuItemKey.WEBSITE]: () => null,
[MenuItemKey.SOCIAL]: () => null,
```

However their HTML renderers in `HTML_RENDERERS` are fully implemented, and
`SocialProviders.ts` exists entirely to support the `SOCIAL` case.

**Decision needed:** Are these planned features for a future manifest shape, or
will they never apply to live video? If the latter, remove:
- The three extractors and their keys from `MenuItemKey` / `MENU_ITEM_LABELS`
- Their HTML renderers
- `src/providers/SocialProviders.ts` entirely

---

## MEDIUM — Cohesion and export hygiene

### 2. `filterRecentCompromisedRegions` exported from `C2paMenu.ts`

**File:** `src/components/C2paMenu.ts`

This is an internal helper that was exported, likely to make it testable.
It should either be moved to a dedicated utility or tested indirectly.
Remove `export` from the function declaration.

### 3. `OnSeekingResult` exported from `C2paTimeline.ts`

**File:** `src/components/C2paTimeline.ts`

This type is the return value of `onSeeking()` and is only consumed in
`C2paPlayer.ts`. It doesn't need to be part of the public surface of the file.
Move to a local type inside `C2paTimeline.ts` or inline it.

### 4. `CREATIVE_WORK_ASSERTION_LABEL` lives in `types.ts`

**File:** `src/types.ts`

This constant is a domain concept specific to `MenuValueExtractor` and has
nothing to do with type definitions. Move it to `MenuValueExtractor.ts`.

---

## LOW — Minor clarity issues

### 5. `onSeeked()` is an empty method

**File:** `src/components/C2paTimeline.ts`

```ts
onSeeked(): void {
  // Seeking has ended — caller is responsible for resetting the seeking flag.
}
```

The method exists purely to communicate intent via a comment, but does nothing.
Either remove it and handle the intent at the call site, or document why it
might need a body in the future.

### 6. Hardcoded status strings in `segmentToPlaybackStatus`

**File:** `src/C2paPlayer.ts`

```ts
const INVALID_STATUSES = new Set(['invalid', 'replayed', 'reordered', 'warning']);
```

These are intentionally hardcoded to avoid a hard dependency on `dashjs-plugin`.
Worth adding a comment explaining this so future maintainers don't try to import
`SegmentStatus` from the plugin.

---

## Prioritized order

1. **Decide on LOCATION/WEBSITE/SOCIAL** — if they're not coming, remove them
   and `SocialProviders.ts`. Biggest impact, cleanest win.
2. **Remove `export` from `filterRecentCompromisedRegions`** — one-liner.
3. **Remove `export` from `OnSeekingResult`** — one-liner.
4. **Move `CREATIVE_WORK_ASSERTION_LABEL`** to `MenuValueExtractor.ts`.
5. **Handle `onSeeked()`** — decide and document.
6. **Add comment to `INVALID_STATUSES`** — one-liner.
