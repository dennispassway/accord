import type { Author, PullRequest } from "../../lib/github/domain";
import { deriveAuthor } from "../../lib/github/domain";

export interface PersonEntry {
  author: Author;
  note: string;
  reviewerState?: PullRequest["reviewers"][number]["state"];
}

const REVIEWER_STATE_LABEL: Record<
  PullRequest["reviewers"][number]["state"],
  string
> = {
  approved: "goedgekeurd",
  changesRequested: "changes requested",
  pending: "in afwachting",
};

/** De rijen van de mensen-sectie. Is de auteur de enige assignee, dan staat
 * dat als notitie bij de auteur en vervalt de Assignee-rij (`mergedAssignee`),
 * zodat dezelfde persoon niet twee keer onder elkaar staat. */
export function peopleRows(
  pr: PullRequest,
  meLogin: string | undefined,
): {
  author: PersonEntry;
  assignees: PersonEntry[];
  reviewers: PersonEntry[];
  mergedAssignee: boolean;
} {
  const mergedAssignee =
    pr.assignees.length === 1 && pr.assignees[0] === pr.author.login;
  const authorNote = mergedAssignee
    ? pr.authoredByMe
      ? "jij · ook assignee"
      : "ook assignee"
    : pr.authoredByMe
      ? "jij"
      : "";
  return {
    author: { author: pr.author, note: authorNote },
    assignees: mergedAssignee
      ? []
      : pr.assignees.map((login) => ({
          author: deriveAuthor(login),
          note: login === meLogin ? "jij" : "",
        })),
    reviewers: pr.reviewers.map((reviewer) => ({
      author: deriveAuthor(reviewer.login),
      note:
        (reviewer.login === meLogin ? "jij · " : "") +
        REVIEWER_STATE_LABEL[reviewer.state],
      reviewerState: reviewer.state,
    })),
    mergedAssignee,
  };
}
