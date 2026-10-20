# Tutorial drafts (review before publishing)

Machine-generated **draft** tutorials land here, written by the weekly
`support-tutorial-gap-miner` scheduled task from recurring customer questions
(AI-assist chats + support tickets) that no existing tutorial covers.

**Nothing in this folder is live.** It sits outside `content/tutorials/`, so the
tutorial loader cannot reach it, the manifest (`_index.json`) does not list it,
the help search and AI concierge never see it, and the `.mdx`-globbing tests
ignore it. A file here is never served at a `/help/tutorials/...` URL.

## How a draft becomes a published tutorial

You review the draft, then promote the ones worth keeping:

1. Move `content/tutorial-drafts/<id>.<locale>.mdx` to
   `content/tutorials/<id>.<locale>.mdx` (all three locales: `en-US`, `es-ES`,
   `fr-FR`).
2. Add an entry to `content/tutorials/_index.json`:
   `{ "id", "title", "category", "summary", "order", "locales": ["en-US","es-ES","fr-FR"] }`
   (optional `audience`, `series`, `seriesOrder`). Do NOT put `videoId` here; a
   walkthrough video is a one-line edit to `content/tutorials/_videos.json`.
3. In the desktop repo run `npm run sync:help-manifest` so the in-app Help copy
   and the support bots' how-to index pick it up.

Deleting a draft is just removing the file. The miner will not re-draft the same
gap once a matching published tutorial exists.

## Authoring rules the drafts follow

- Frontmatter is a flat `title:` / `summary:` / `category:` block between `---`
  fences (no nested YAML, no lists).
- Body is the restricted Markdown the tutorial renderer supports: headings,
  paragraphs, lists, ordered lists, blockquotes, fenced code, inline
  `code`/**bold**/*italic*, links, `/assets/`-only images, and `@youtube(ID)` on
  its own line. No raw HTML.
- No em dashes in customer-facing copy (use a colon, comma, or hyphen).
- No customer names, emails, or any identifying detail from the source chats or
  tickets. Drafts describe the feature, never the person who asked.
