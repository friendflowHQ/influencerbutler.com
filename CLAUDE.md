# Project conventions

## Punctuation: no em dashes, anywhere

**Never produce the em dash character (Unicode U+2014, the long horizontal dash that looks like three hyphens joined together) in any output for this repo.** Not in code, string literals, comments, JSX/MDX content, HTML, JSON, SQL, commit messages, or PR descriptions.

When you would have reached for one, choose one of these instead:

- **Colon (`:`)** when separating a label/title from its description.
  - `Action Queue: one inbox for every butler that needs your decision`
  - `<li><strong>Daily Commission Butler</strong>: campaigns whose commission rate is unusual</li>`
- **Regular hyphen (`-`)** for mid-sentence breaks or parentheticals.
  - `Action Queue is consumed by other workspaces - it has no setup of its own.`
- **Comma (`,`)** or parentheses when the prose flows better that way.

Also avoid en dashes (Unicode U+2013) unless representing a numeric or date range like `2024-2026`.

This rule applies to user-facing copy (tutorials, marketing pages, legal docs, emails, dashboard UI strings) and internal code (comments, log strings, error messages) alike. The site was bulk-cleaned of ~2,200 em dashes; please do not reintroduce them.
