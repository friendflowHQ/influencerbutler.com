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

## Step-by-step tutorials: always cover both Windows and Mac

Any detailed tutorial or troubleshooting walkthrough (blog posts, Help & Tutorials, guides, support emails) that includes OS-specific steps must cover **both Windows and macOS**. That means both variants of anything OS-dependent:

- Shell commands: PowerShell for Windows AND Terminal (bash/zsh) for Mac.
- File paths: `%APPDATA%` / `$env:APPDATA` maps to `$HOME/Library/Application Support` on Mac; `Program Files` app paths map to `/Applications/<App>.app/Contents/MacOS/<App>`.
- App lifecycle: Windows system tray vs Mac menu bar / Dock for quitting the app.

Label the variants clearly (e.g. `**On Windows:**` / `**On Mac:**`). Reference example: `content/blog/fix-facebook-notifications-popup.en-US.mdx`. Exception: content explicitly scoped to one OS (e.g. the Windows-only cloud PC guide) can stay single-OS, but say so in the copy.

## Embedding YouTube videos: also add them to Help & Tutorials

Whenever we embed a YouTube video anywhere (marketing page, feature page, email, dashboard, or the desktop app), also embed it in Help & Tutorials in the matching tutorial section.

- Use the `@youtube(VIDEO_ID)` syntax on its own line in the relevant `content/tutorials/*.mdx` file, and add it to **all locales** (`en-US`, `es-ES`, `fr-FR`). The renderer in `src/lib/tutorials.ts` turns it into a privacy-mode `youtube-nocookie.com` iframe; no raw iframe markup is needed.
- **If you are unsure which tutorial or section it belongs in, ask first** before adding it.

Reference embeds already in place:

- Creator API setup (`plZS_nXX-BE`) in `api-integrations` (Watch the walkthrough section).
- Amazon Deals to Google Worksheet (`gCIw2WNnbWU`) in `daily-deals` (Send deals to a Google Sheet section).
