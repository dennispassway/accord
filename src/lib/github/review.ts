import { runMutation } from "./mutation";
import type { FetchImpl } from "./queries";

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

const ADD_REVIEW_MUTATION = `
mutation AddPullRequestReview($pullRequestId: ID!, $event: PullRequestReviewEvent!, $body: String!) {
  addPullRequestReview(input: { pullRequestId: $pullRequestId, event: $event, body: $body }) {
    pullRequestReview { id }
  }
}
`;

const FORBIDDEN_MESSAGE =
  "Geen schrijfrechten om te reviewen, of een GitHub rate limit";

/** Reviewt een PR via de addPullRequestReview GraphQL-mutatie. Changes vragen
 * en reageren vereisen een niet-lege reactie; goedkeuren niet. */
export async function submitReview(
  token: string,
  prNodeId: string,
  event: ReviewEvent,
  body: string,
  fetchImpl: FetchImpl,
): Promise<void> {
  if (
    (event === "REQUEST_CHANGES" || event === "COMMENT") &&
    (body ?? "").trim() === ""
  ) {
    throw new Error("Een reactie is verplicht bij changes vragen of reageren");
  }

  await runMutation(
    token,
    ADD_REVIEW_MUTATION,
    { pullRequestId: prNodeId, event, body },
    fetchImpl,
    FORBIDDEN_MESSAGE,
  );
}
