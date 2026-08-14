import { execSync } from "node:child_process";

/**
 * The date of the commit being built, stamped into the bundle at build time so
 * the footer can tell users how fresh the deployed code is.
 *
 * Git is available during a Vercel build (it clones the repo), so `git log`
 * normally resolves. If it doesn't — a source tarball, a Docker build without
 * the .git directory — fall back to the build timestamp, which is still a
 * truthful "this is when the running code was produced".
 *
 * An explicit NEXT_PUBLIC_BUILD_DATE in the environment always wins.
 */
function resolveBuildDate() {
  if (process.env.NEXT_PUBLIC_BUILD_DATE) return process.env.NEXT_PUBLIC_BUILD_DATE;
  try {
    const iso = execSync("git log -1 --format=%cI", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (iso) return iso;
  } catch {
    // No git available — fall through to the build timestamp.
  }
  return new Date().toISOString();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_DATE: resolveBuildDate(),
  },
};

export default nextConfig;
