// Type surface for changelog-check.mjs so src/ tests can import it under
// `tsc --noEmit` (tsconfig has no allowJs).
export type ChangelogSection = { heading: string; items: string[] };
export type ChangelogRelease = { version: string; date: string; sections: ChangelogSection[] };
export type Changelog = { lastUpdated?: string; releases: ChangelogRelease[] };

export type Semver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
};

export function parseSemver(version: unknown): Semver | null;
export function compareSemver(a: string, b: string): number;
export function hasReleaseEntry(changelog: unknown, version: string): boolean;
export function validateChangelog(changelog: unknown): { ok: boolean; errors: string[] };
export function loadChangelog(filePath?: string): Changelog;
export function defaultChangelogPath(): string;
export function missingEntryMessage(version: string): string;
export function checkReleaseEntry(version: string, filePath?: string): boolean;
