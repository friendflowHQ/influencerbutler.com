// Changelog hygiene for static/changelog.json, the file the post-update
// "What's New" notice reads (src/background/whats-new.ts). Two jobs:
//
//   hasReleaseEntry(changelog, version)  the bump and zip scripts refuse to
//                                        ship a version that has no notes
//   validateChangelog(changelog)         shape, unique versions, newest-first
//
// CLI: node scripts/changelog-check.mjs <version>
// Exits 1 with a clear message when the entry is missing or the file is
// malformed, so it can gate a release from npm scripts or CI.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EM_DASH = String.fromCharCode(0x2014);

// Loose semver: "x.y.z" with optional pre-release ("0.2.0-beta.1"). Returns
// null when the string is not a version at all.
export function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(version).trim());
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ?? null,
  };
}

// Standard semver ordering: numeric parts, then a pre-release sorts before the
// bare version. Returns a negative number, zero, or a positive number.
export function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return String(a).localeCompare(String(b));
  for (const key of ["major", "minor", "patch"]) {
    if (pa[key] !== pb[key]) return pa[key] - pb[key];
  }
  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === null) return 1;
  if (pb.prerelease === null) return -1;
  return pa.prerelease.localeCompare(pb.prerelease);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// True when a release with exactly this version exists and carries at least
// one section with at least one non-empty item. An entry that is only a
// version number is not release notes.
export function hasReleaseEntry(changelog, version) {
  const releases = changelog?.releases;
  if (!Array.isArray(releases)) return false;
  const release = releases.find((r) => r && String(r.version) === String(version).trim());
  if (!release || !Array.isArray(release.sections)) return false;
  return release.sections.some(
    (s) => s && Array.isArray(s.items) && s.items.some(isNonEmptyString),
  );
}

// Structural validation. Returns { ok, errors } rather than throwing so the
// caller (CLI or test) can print every problem at once.
export function validateChangelog(changelog) {
  const errors = [];
  if (!changelog || typeof changelog !== "object" || Array.isArray(changelog)) {
    return { ok: false, errors: ["changelog must be a JSON object"] };
  }
  if (changelog.lastUpdated !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(changelog.lastUpdated))) {
    errors.push(`lastUpdated "${changelog.lastUpdated}" must be YYYY-MM-DD`);
  }
  const releases = changelog.releases;
  if (!Array.isArray(releases)) {
    errors.push("releases must be an array");
    return { ok: false, errors };
  }

  const seen = new Set();
  releases.forEach((release, i) => {
    const label = `releases[${i}]`;
    if (!release || typeof release !== "object" || Array.isArray(release)) {
      errors.push(`${label} must be an object`);
      return;
    }
    const version = release.version;
    if (!isNonEmptyString(version)) {
      errors.push(`${label}.version must be a non-empty string`);
    } else if (!parseSemver(version)) {
      errors.push(`${label}.version "${version}" is not a valid x.y.z version`);
    } else if (seen.has(version)) {
      errors.push(`${label}.version "${version}" appears more than once`);
    } else {
      seen.add(version);
    }
    if (!isNonEmptyString(release.date)) {
      errors.push(`${label}.date must be a non-empty string`);
    }
    if (!Array.isArray(release.sections) || release.sections.length === 0) {
      errors.push(`${label}.sections must be a non-empty array`);
    } else {
      release.sections.forEach((section, j) => {
        const sLabel = `${label}.sections[${j}]`;
        if (!section || typeof section !== "object" || Array.isArray(section)) {
          errors.push(`${sLabel} must be an object`);
          return;
        }
        if (!isNonEmptyString(section.heading)) {
          errors.push(`${sLabel}.heading must be a non-empty string`);
        }
        if (!Array.isArray(section.items)) {
          errors.push(`${sLabel}.items must be an array`);
          return;
        }
        section.items.forEach((item, k) => {
          if (!isNonEmptyString(item)) {
            errors.push(`${sLabel}.items[${k}] must be a non-empty string`);
          } else if (item.includes(EM_DASH)) {
            errors.push(`${sLabel}.items[${k}] contains an em dash (U+2014); use ':' or '-' instead`);
          }
        });
      });
    }
  });

  // Newest first, strictly descending: the notice falls back to releases[0]
  // when the running version has no entry, so order is load-bearing.
  const versions = releases
    .map((r) => r?.version)
    .filter((v) => isNonEmptyString(v) && parseSemver(v));
  for (let i = 1; i < versions.length; i += 1) {
    if (compareSemver(versions[i - 1], versions[i]) <= 0) {
      errors.push(
        `releases are not newest-first: "${versions[i - 1]}" is followed by "${versions[i]}"`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// Reads and parses static/changelog.json (or any path). Throws on unreadable
// or non-JSON input so callers can report the file, not a vague shape error.
export function loadChangelog(filePath = defaultChangelogPath()) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function defaultChangelogPath() {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  return path.join(root, "static", "changelog.json");
}

// The message the bump and zip scripts print before refusing to ship.
export function missingEntryMessage(version) {
  return `no changelog entry for ${version}; add it to static/changelog.json first (or pass --allow-missing-changelog)`;
}

// Shared gate for bump.mjs and zip.mjs: validates the file and requires an
// entry for `version`. Returns true when clear; prints and returns false
// otherwise (the caller decides whether --allow-missing-changelog bypasses it).
export function checkReleaseEntry(version, filePath = defaultChangelogPath()) {
  let changelog;
  try {
    changelog = loadChangelog(filePath);
  } catch (error) {
    console.error(`could not read ${filePath}: ${error instanceof Error ? error.message : error}`);
    return false;
  }
  const { ok, errors } = validateChangelog(changelog);
  if (!ok) {
    console.error(`${path.basename(filePath)} is malformed:`);
    for (const err of errors) console.error("  " + err);
    return false;
  }
  if (!hasReleaseEntry(changelog, version)) {
    console.error(missingEntryMessage(version));
    return false;
  }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  if (!version) {
    console.error("usage: node scripts/changelog-check.mjs <version>");
    process.exit(1);
  }
  if (!checkReleaseEntry(version)) process.exit(1);
  console.log(`changelog entry found for ${version}`);
}
