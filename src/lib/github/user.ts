import { AuthError, type FetchImpl, GithubApiError } from "./queries";

export type GithubViewer = {
  login: string;
  avatar_url: string;
};

/** Fetches the authenticated user ("who am I"). */
export async function fetchViewer(
  token: string,
  fetchImpl: FetchImpl,
): Promise<GithubViewer> {
  const response = await fetchImpl("https://api.github.com/user", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    throw new AuthError();
  }
  if (!response.ok) {
    throw new GithubApiError(`GitHub API responded with ${response.status}`);
  }

  return (await response.json()) as GithubViewer;
}
