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
mutation AddPullRequestReview($pullRequestId: ID!, $event: PullRequestReviewEvent!, $body: String!, $threads: [DraftPullRequestReviewThread!], $commitOID: GitObjectID) {
  addPullRequestReview(input: { pullRequestId: $pullRequestId, event: $event, body: $body, threads: $threads, commitOID: $commitOID }) {
    pullRequestReview { id }
  }
}
`;

const FORBIDDEN_MESSAGE =
  "Geen schrijfrechten om te reviewen, of een GitHub rate limit";

/** De ene beslissing of een review verstuurd mag worden; de verzending en
 * alle UI (knoppen, afrondpaneel) lezen deze reden. Goedkeuren mag zonder
 * tekst, changes vragen niet, reageren alleen met regelopmerkingen. Op een
 * eigen PR kan alleen gereageerd worden. */
export function reviewBlockedReason(
  event: ReviewEvent,
  body: string,
  draftCount: number,
  authoredByMe: boolean,
): string | null {
  if (authoredByMe && event === "APPROVE") {
    return "Je kunt je eigen PR niet goedkeuren";
  }
  if (authoredByMe && event === "REQUEST_CHANGES") {
    return "Je kunt geen changes vragen op je eigen PR";
  }
  if (body.trim() !== "") return null;
  if (event === "REQUEST_CHANGES") {
    return "Een reactie is verplicht bij changes vragen";
  }
  if (event === "COMMENT" && draftCount === 0) {
    return "Een reactie is verplicht bij reageren zonder opmerkingen op regels";
  }
  return null;
}

/** Reviewt een PR via de addPullRequestReview GraphQL-mutatie. */
export async function submitReview(
  token: string,
  prNodeId: string,
  event: ReviewEvent,
  body: string,
  fetchImpl: FetchImpl,
  threads: readonly DraftThread[] = [],
  authoredByMe = false,
  /** Commit waarop de regels van `threads` gelden; "" = de huidige head. */
  commitOid = "",
): Promise<void> {
  if (threads.some((t) => (t.body ?? "").trim() === "")) {
    throw new Error("Een regelopmerking mag niet leeg zijn");
  }
  const reason = reviewBlockedReason(
    event,
    body ?? "",
    threads.length,
    authoredByMe,
  );
  if (reason !== null) throw new Error(reason);

  await runMutation(
    token,
    ADD_REVIEW_MUTATION,
    {
      pullRequestId: prNodeId,
      event,
      body,
      // Zonder concepten dezelfde variabelen als vóór regelopmerkingen
      // bestonden: een lege lijst is nooit tegen GitHub zelf getoetst.
      ...(threads.length > 0 && { threads }),
      // Zonder commit plaatst GitHub de regels op de huidige head: na een
      // push staat er op dat regelnummer andere code.
      ...(threads.length > 0 && commitOid !== "" && { commitOID: commitOid }),
    },
    fetchImpl,
    FORBIDDEN_MESSAGE,
  );
}
