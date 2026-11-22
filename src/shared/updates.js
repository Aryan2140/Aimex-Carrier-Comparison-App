/**
 * GitHub update checker using GitHub Releases API with manifest.json fallback.
 */

import { DEFAULT_REPO_URL, REQUEST_TIMEOUT_MS } from './constants.js';

/**
 * Parse a GitHub repository URL or owner/repo shorthand into { owner, repo }.
 * @param {string} repoUrl
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGitHubRepo(repoUrl) {
  const input = String(repoUrl || '').trim();
  if (!input) return null;

  const shorthand = input.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  try {
    const parsed = new URL(input);
    if (!/github\.com$/i.test(parsed.hostname)) return null;
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

function normalizeSemver(version) {
  const clean = String(version || '').trim().replace(/^v/i, '');
  const [core, pre = ''] = clean.split('-', 2);
  const nums = core.split('.').map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
  while (nums.length < 3) nums.push(0);
  return { nums, pre };
}

/**
 * Compare two semantic version strings (a < b => -1, a === b => 0, a > b => 1).
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareSemver(a, b) {
  const pa = normalizeSemver(a);
  const pb = normalizeSemver(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i += 1) {
    const va = pa.nums[i] ?? 0;
    const vb = pb.nums[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre !== pb.pre) return pa.pre < pb.pre ? -1 : 1;
  return 0;
}

async function fetchWithTimeout(url, options, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function decodeBase64Utf8(base64Str) {
  const clean = String(base64Str || '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Check GitHub for newer releases or manifest versions.
 * @param {object} options
 * @param {string} options.currentVersion
 * @param {string} [options.repoUrl]
 * @param {string} [options.githubToken]
 * @param {typeof fetch} [options.fetchImpl]
 */
export async function checkForUpdates({
  currentVersion,
  repoUrl = DEFAULT_REPO_URL,
  githubToken = '',
  fetchImpl = fetch
}) {
  const checkedAt = new Date().toISOString();
  const parsed = parseGitHubRepo(repoUrl);
  if (!parsed) {
    return {
      status: 'error',
      currentVersion,
      latestVersion: null,
      releaseUrl: '',
      releaseNotes: '',
      checkedAt,
      error: 'The GitHub repository URL is invalid. Use https://github.com/owner/repo.'
    };
  }

  const { owner, repo } = parsed;
  const repoHtmlUrl = `https://github.com/${owner}/${repo}`;
  const headers = { Accept: 'application/vnd.github+json' };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  try {
    const releaseUrlApi = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const releaseResp = await fetchWithTimeout(releaseUrlApi, { headers, cache: 'no-store' }, fetchImpl);

    if (releaseResp.ok) {
      const release = await releaseResp.json();
      const latestVersion = String(release.tag_name || release.name || '').replace(/^v/i, '');
      if (!latestVersion) {
        return {
          status: 'error',
          currentVersion,
          latestVersion: null,
          releaseUrl: release.html_url || repoHtmlUrl,
          releaseNotes: '',
          checkedAt,
          error: 'Latest GitHub release does not specify a version tag.'
        };
      }
      const cmp = compareSemver(currentVersion, latestVersion);
      return {
        status: cmp < 0 ? 'update_available' : 'up_to_date',
        currentVersion,
        latestVersion,
        releaseUrl: release.html_url || repoHtmlUrl,
        releaseNotes: String(release.body || '').trim(),
        source: 'release',
        checkedAt,
        error: ''
      };
    }

    if (releaseResp.status === 401 || releaseResp.status === 403) {
      return {
        status: 'error',
        currentVersion,
        latestVersion: null,
        releaseUrl: repoHtmlUrl,
        releaseNotes: '',
        checkedAt,
        error: githubToken
          ? 'GitHub rejected the access token or rate-limited update checks.'
          : 'GitHub API rate limit reached or repository requires authentication.'
      };
    }

    // Fallback when no GitHub Release exists yet (or repo is empty/unreleased)
    let remoteManifest = null;
    if (githubToken) {
      const contentsResp = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/contents/manifest.json`,
        { headers, cache: 'no-store' },
        fetchImpl
      );
      if (contentsResp.ok) {
        const fileData = await contentsResp.json();
        if (fileData?.content) {
          remoteManifest = JSON.parse(decodeBase64Utf8(fileData.content));
        }
      }
    } else {
      for (const branch of ['main', 'master']) {
        const rawResp = await fetchWithTimeout(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`,
          { cache: 'no-store' },
          fetchImpl
        );
        if (rawResp.ok) {
          remoteManifest = await rawResp.json();
          break;
        }
      }
    }

    if (remoteManifest?.version) {
      const latestVersion = String(remoteManifest.version).replace(/^v/i, '');
      const cmp = compareSemver(currentVersion, latestVersion);
      return {
        status: cmp < 0 ? 'update_available' : 'up_to_date',
        currentVersion,
        latestVersion,
        releaseUrl: repoHtmlUrl,
        releaseNotes: '',
        source: 'manifest',
        checkedAt,
        error: ''
      };
    }

    return {
      status: 'error',
      currentVersion,
      latestVersion: null,
      releaseUrl: repoHtmlUrl,
      releaseNotes: '',
      checkedAt,
      error:
        'Could not find releases or manifest.json on GitHub. If you have not pushed the repository yet (or it is private without a GitHub token in Settings), upload it first and check again.'
    };
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    return {
      status: 'error',
      currentVersion,
      latestVersion: null,
      releaseUrl: repoHtmlUrl,
      releaseNotes: '',
      checkedAt,
      error: isTimeout
        ? 'Timed out while checking GitHub for updates. Please try again.'
        : 'Unable to reach GitHub right now. Check your internet connection and try again.'
    };
  }
}
