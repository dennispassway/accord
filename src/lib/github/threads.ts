/**
 * Mutaties op één review-thread in de inspector: beantwoorden en
 * resolven/heropenen (D4). Zelfde foutclassificatie als merge.ts, via de
 * gedeelde runMutation (mutation.ts): 401 -> AuthError, 403/429 ->
 * GithubApiError met Nederlandse rechten-/rate-limit-tekst, elke andere
 * niet-ok status -> GithubApiError, en een GraphQL-errors-body zonder
 * bruikbare data -> GithubApiError met de servermelding.
 */
import { deriveAuthor } from "./domain";
import { runMutation } from "./mutation";
import type { PrComment } from "./prDetail";
import type { FetchImpl } from "./queries";

const REPLY_MUTATION = `
mutation ReplyToThread($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
    comment { author { login } bodyText body createdAt }
  }
}
`;

const RESOLVE_MUTATION = `
mutation ResolveThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`;

const UNRESOLVE_MUTATION = `
mutation UnresolveThread($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread { id isResolved }
  }
}
`;

const FORBIDDEN_MESSAGE =
  "Geen schrijfrechten op deze thread, of een GitHub rate limit";

interface ReplyMutationData {
  addPullRequestReviewThreadReply?: {
    comment?: {
      author?: { login?: string | null } | null;
      bodyText?: string | null;
      body?: string | null;
      createdAt?: string | null;
    } | null;
  };
}

/** Beantwoordt een review-thread en geeft de geplaatste comment terug zoals
 * GitHub 'm registreert, zodat de aanroeper 'm lokaal kan tonen zonder een
 * aparte fetch. Gooit vóór elke aanvraag als de (getrimde) body leeg is, null
 * of undefined. */
export async function replyToThread(
  token: string,
  threadId: string,
  body: string | null | undefined,
  fetchImpl: FetchImpl,
): Promise<PrComment> {
  const trimmed = body?.trim() ?? "";
  if (trimmed === "") {
    throw new Error("Een reactie mag niet leeg zijn.");
  }
  const data = await runMutation<ReplyMutationData>(
    token,
    REPLY_MUTATION,
    { threadId, body: trimmed },
    fetchImpl,
    FORBIDDEN_MESSAGE,
  );
  const comment = data?.addPullRequestReviewThreadReply?.comment;
  return {
    author: deriveAuthor(comment?.author?.login ?? "ghost"),
    bodyText: comment?.bodyText ?? trimmed,
    body: comment?.body ?? trimmed,
    createdAt: comment?.createdAt ?? new Date().toISOString(),
  };
}

/** Resolvet (true) of heropent (false) een review-thread. */
export async function setThreadResolved(
  token: string,
  threadId: string,
  resolved: boolean,
  fetchImpl: FetchImpl,
): Promise<void> {
  await runMutation(
    token,
    resolved ? RESOLVE_MUTATION : UNRESOLVE_MUTATION,
    { threadId },
    fetchImpl,
    FORBIDDEN_MESSAGE,
  );
}
