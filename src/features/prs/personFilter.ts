import type { PullRequest } from "../../lib/github/domain";

/** Het record dwingt volledigheid af; PERSON_ROLES wordt eruit afgeleid. */
export const PERSON_ROLE_LABEL = {
  author: "Auteur",
  assignee: "Assignee",
  reviewer: "Reviewer",
} as const;

export type PersonRole = keyof typeof PERSON_ROLE_LABEL;

export const PERSON_ROLES = Object.keys(PERSON_ROLE_LABEL) as PersonRole[];

/** `login: null` is "Iedereen"; de rol blijft dan staan voor de volgende keuze. */
export interface PersonFilter {
  role: PersonRole;
  login: string | null;
}

function loginsIn(pr: PullRequest, role: PersonRole): string[] {
  switch (role) {
    case "author":
      return [pr.author.login];
    case "assignee":
      return pr.assignees;
    case "reviewer":
      return pr.reviewers.map((reviewer) => reviewer.login);
  }
}

/** Een reviewverzoek aan een team van mij staat niet in `reviewers` (de query
 * leest alleen users), maar telt via review-requested:@me wel mee in de vlag. */
const MY_ROLE_FLAG: Record<PersonRole, (pr: PullRequest) => boolean> = {
  author: (pr) => pr.authoredByMe,
  assignee: (pr) => pr.assignedToMe,
  reviewer: (pr) => pr.reviewRequestedFromMe,
};

function hasRole(
  pr: PullRequest,
  role: PersonRole,
  login: string,
  me: string,
): boolean {
  return (
    (login === me && MY_ROLE_FLAG[role](pr)) ||
    loginsIn(pr, role).includes(login)
  );
}

export function matchesPerson(
  pr: PullRequest,
  filter: PersonFilter,
  me: string,
): boolean {
  return filter.login == null || hasRole(pr, filter.role, filter.login, me);
}

export function displayLogin(login: string, me: string): string {
  return login === me ? "Ik" : login;
}

export function personFilterLabel(filter: PersonFilter, me: string): string {
  if (filter.login == null) return "Iedereen";
  return `${displayLogin(filter.login, me)} · ${PERSON_ROLE_LABEL[filter.role].toLowerCase()}`;
}

export interface PersonOption {
  login: string;
  count: number;
}

/**
 * De keuzes in het filtermenu: ik bovenaan, dan iedereen die in `prs` die rol
 * heeft, alfabetisch. De gekozen persoon blijft erin staan (met 0) als hij
 * die rol nergens heeft, na een refresh of een rolwissel die de login
 * vasthoudt: anders staat er nergens een vinkje en is de lege lijst onverklaard.
 */
export function peopleFor(
  prs: PullRequest[],
  role: PersonRole,
  me: string,
  selected: string | null,
): PersonOption[] {
  const counts = new Map<string, number>();
  for (const pr of prs) {
    for (const login of new Set(loginsIn(pr, role))) {
      counts.set(login, (counts.get(login) ?? 0) + 1);
    }
  }
  const others = [...counts.keys()]
    .filter((login) => login !== me)
    .sort((a, b) => a.localeCompare(b));
  if (selected != null && selected !== me && !counts.has(selected)) {
    others.push(selected);
  }
  const myCount = prs.filter((pr) => hasRole(pr, role, me, me)).length;
  return [
    { login: me, count: myCount },
    ...others.map((login) => ({ login, count: counts.get(login) ?? 0 })),
  ];
}
