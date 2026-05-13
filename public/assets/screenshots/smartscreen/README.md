# SmartScreen walkthrough screenshots

These images are referenced by `src/components/welcome/WindowsSmartScreenGuide.tsx`
(shown on the post-purchase `/welcome/*` pages). Until real annotated screenshots
land here, the component renders a labeled placeholder block in their place — swap
the placeholder for an `<img>` in that component once the files below exist.

## Files to add

### `browser-keep-anyway.png`

Annotated screenshot of the Chrome (or Edge) download bar after a fresh download
of `Influencer Butler Setup X.Y.Z.exe`.

- Aspect ratio: **16:7** (e.g. 1280×560 or 1600×700).
- Show the download bar with the filename, the SmartScreen warning icon, and
  the panel that appears on click.
- Annotate: arrow pointing to the `▼` dropdown arrow next to **Delete**, and a
  second arrow / highlight on **Keep anyway**.
- Redact: any other tabs/extensions/profile pictures visible in the browser
  chrome.

### `windows-protected-your-pc.png`

Annotated screenshot of the "Windows protected your PC" launch prompt that
appears when running the .exe.

- Aspect ratio: **16:10** (e.g. 1600×1000).
- Capture both states ideally — but for one image, prefer the **after "More
  info" was clicked** state so the **Run anyway** button is visible.
- Annotate: arrow on **More info** (left) and a second arrow on **Run anyway**
  (right).
- Confirm the prompt shows `Publisher: THE SOCIAL MEDIA POSSE LLC` — if it
  doesn't, the binary isn't signed correctly and the screenshot would mislead
  users. Re-test with a fresh signed build before capturing.

## Style notes

Match the rest of the site: light backgrounds, orange `#f97316` for annotation
arrows/highlights (it ties to the step-number badges in the component). Keep
the annotations sparse — one or two arrows per shot. Crop tight to the prompt.

PNG, lossless. Aim for &lt;300KB each (tinypng.com or similar after export).
