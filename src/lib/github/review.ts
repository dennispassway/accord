import { runMutation } from "./mutation";
import type { DiffSide } from "./prDetail";
import type { FetchImpl } from "./queries";

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export interface DraftThread {
  path: string;
  line: number;
  side: DiffSide;
  body: string;
}

const ADD_REVIEW_MUTATION = `
mutation AddPullRequestReview($pullRequestId: ID!, $event: PullRequestReviewEvent!, $body: String!, $threads: [DraftPullRequestReviewThread!]) {
  addPullRequestReview(input: { pullRequestId: $pullRequestId, event: $event, body: $body, threads: $threads }) {
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
  threads: readonly DraftThread[] = [],
): Promise<void> {
  if (threads.some((t) => (t.body ?? "").trim() === "")) {
    throw new Error("Een regelopmerking mag niet leeg zijn");
  }
  const emptyBody = (body ?? "").trim() === "";
  if (
    emptyBody &&
    (event === "REQUEST_CHANGES" ||
      (event === "COMMENT" && threads.length === 0))
  ) {
    throw new Error("Een reactie is verplicht bij changes vragen of reageren");
  }

  await runMutation(
    token,
    ADD_REVIEW_MUTATION,
    {
      pullRequestId: prNodeId,
      event,
      body,
      // Lege lijst weglaten: GitHub behandelt een weggelaten variabele als geen threads.
      ...(threads.length > 0 && { threads }),
    },
    fetchImpl,
    FORBIDDEN_MESSAGE,
  );
}
