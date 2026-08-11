/**
 * Mockdata voor de dev-mockmodus, geporteerd uit de demo-dataset in
 * docs/design-v2/pr-cockpit-v2.dc.html (PRS/PEOPLE/COMMENTS/MOM, regels
 * 668-757). Tijden zijn relatief aan module-load, zodat "18 min geleden"
 * ook klopt op het moment dat je de app opent.
 *
 * ponytail: bewust in de productiebundel; het is dode data (mockMode() kan
 * in een productiebuild nooit "app" zijn, zie ../mock/mode.ts), maar splitsen
 * in een dynamische import voegt complexiteit toe voor bytes die toch al
 * tree-shaken zouden moeten worden. Upgrade als bundle-omvang ooit meetbaar
 * een probleem wordt.
 */
import {
  type AgentReview,
  type CiStatus,
  deriveAuthor,
  type Mergeable,
  type PullRequest,
  type Reviewer,
  type ReviewerState,
  type ReviewState,
  toPrNumber,
  toRepoId,
} from "../github/domain";

export const MOCK_ME = "octocat";

const NOW = Date.now();

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

function daysAgo(days: number, hour: number, minute: number): string {
  const d = new Date(NOW - days * 24 * 60 * 60_000);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function ci(
  state: "rood" | "groen" | "geen" | "bezig",
  failed: string[],
): CiStatus {
  switch (state) {
    case "rood":
      return { state: "failure", failedChecks: failed };
    case "groen":
      return { state: "success" };
    case "bezig":
      return { state: "pending" };
    case "geen":
      return { state: "none" };
  }
}

function review(
  state: "gevraagd" | "geen" | "goedgekeurd" | "changes",
): ReviewState {
  switch (state) {
    case "gevraagd":
      return { state: "reviewRequested" };
    case "goedgekeurd":
      return { state: "approved" };
    case "changes":
      return { state: "changesRequested" };
    case "geen":
      return { state: "none" };
  }
}

function mergeable(state: "conflict" | "kan" | "onbekend"): Mergeable {
  switch (state) {
    case "conflict":
      return "CONFLICTING";
    case "kan":
      return "MERGEABLE";
    case "onbekend":
      return "UNKNOWN";
  }
}

/** Eén rij uit ARUNS (designspec, regels 743-751): agent, modus, opmerkingen, commits, minuten geleden. */
type RawARun = [
  "claude" | "codex",
  "comments" | "fixes",
  number,
  number,
  number,
];

function agentRun([
  agent,
  mode,
  commentCount,
  commitCount,
  minAgo,
]: RawARun): AgentReview {
  return {
    agent,
    mode: mode === "fixes" ? "commentsAndFixes" : "commentsOnly",
    commentCount,
    commitCount,
    submittedAt: minutesAgo(minAgo),
  };
}

function reviewerState(
  state: "gevraagd" | "goedgekeurd" | "changes",
): ReviewerState {
  switch (state) {
    case "gevraagd":
      return "pending";
    case "goedgekeurd":
      return "approved";
    case "changes":
      return "changesRequested";
  }
}

interface RawPr {
  id: string;
  repo: string;
  nr: number;
  title: string;
  head: string;
  base: string;
  author: string;
  ci: "rood" | "groen" | "geen" | "bezig";
  failed: string[];
  review: "gevraagd" | "geen" | "goedgekeurd" | "changes";
  draft: boolean;
  mergeable: "conflict" | "kan" | "onbekend";
  prio: 1 | 2 | null;
  add: number;
  del: number;
  /** [dagen geleden, uur UTC, minuut UTC] van createdAt. */
  created: [number, number, number];
  /** Minuten geleden van updatedAt. */
  updatedMin: number;
  assignees: string[];
  reviewers: [string, "gevraagd" | "goedgekeurd" | "changes"][];
  comments: number;
  /** ARUNS uit de designspec: reviewhistorie van agents op deze PR. */
  aRuns?: RawARun[];
}

// Geporteerd uit PRS + PEOPLE + COMMENTS + MOM in de designspec.
const RAW_PRS: RawPr[] = [
  {
    id: "hoc49",
    repo: "acme/storefront",
    nr: 49,
    title:
      "feat(b2b-partner): volledig partnerportaal met module, portal, facturatie en webhook-API",
    head: "feat/b2b-partner",
    base: "main",
    author: "hubot",
    ci: "rood",
    failed: ["build (node 20)", "e2e / chromium", "lint / eslint"],
    review: "gevraagd",
    draft: false,
    mergeable: "conflict",
    prio: 1,
    add: 4212,
    del: 388,
    created: [10, 9, 14],
    updatedMin: 18,
    assignees: ["hubot"],
    reviewers: [["octocat", "gevraagd"]],
    comments: 24,
  },
  {
    id: "ama36",
    repo: "acme/charity-site",
    nr: 36,
    title: "Added donation widget module",
    head: "feature/add_donation_widget_module",
    base: "main",
    author: "hubot",
    ci: "geen",
    failed: [],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 112,
    del: 0,
    created: [8, 16, 32],
    updatedMin: 120,
    assignees: [],
    reviewers: [["octocat", "gevraagd"]],
    comments: 3,
    aRuns: [["claude", "comments", 2, 0, 60]],
  },
  {
    id: "job298",
    repo: "acme/jobs-api",
    nr: 298,
    title:
      "WEB-125: fix ForeignKeyConstraintViolationException bij verwijderen search",
    head: "fix/web-125-fk-constraint",
    base: "develop",
    author: "octocat",
    ci: "geen",
    failed: [],
    review: "geen",
    draft: true,
    mergeable: "onbekend",
    prio: null,
    add: 64,
    del: 12,
    created: [0, 19, 41],
    updatedMin: 35,
    assignees: ["octocat"],
    reviewers: [],
    comments: 2,
  },
  {
    id: "ken167",
    repo: "acme/knowledge-base",
    nr: 167,
    title:
      "Atomische deploys: releases-mappen en current-symlink in plaats van rsync",
    head: "feat/atomische-deploys",
    base: "main",
    author: "monalisa",
    ci: "groen",
    failed: [],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 204,
    del: 140,
    created: [9, 11, 5],
    updatedMin: 60,
    assignees: ["monalisa"],
    reviewers: [["octocat", "gevraagd"]],
    comments: 6,
  },
  {
    id: "ken186",
    repo: "acme/knowledge-base",
    nr: 186,
    title: "fix(qa): combineer B1-B7 fixes en reviewhardening",
    head: "fix/qa-b1b7",
    base: "main",
    author: "Claude",
    ci: "groen",
    failed: [],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 318,
    del: 96,
    created: [2, 14, 22],
    updatedMin: 65,
    assignees: ["octocat"],
    reviewers: [["octocat", "gevraagd"]],
    comments: 9,
    aRuns: [["claude", "fixes", 5, 1, 180]],
  },
  {
    id: "ken188",
    repo: "acme/knowledge-base",
    nr: 188,
    title:
      "fix(retrieval): herleidbare citaties en antwoordtaal zonder systeemjargon",
    head: "fix/retrieval-citaties",
    base: "fix/qa-b1b7",
    author: "Claude",
    ci: "groen",
    failed: [],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 142,
    del: 18,
    created: [1, 10, 48],
    updatedMin: 52,
    assignees: ["octocat"],
    reviewers: [["octocat", "gevraagd"]],
    comments: 6,
    aRuns: [["claude", "comments", 4, 0, 40]],
  },
  {
    id: "ken191",
    repo: "acme/knowledge-base",
    nr: 191,
    title: "fix(admin): duidelijker instellingen en helpteksten",
    head: "fix/admin-instellingen",
    base: "fix/retrieval-citaties",
    author: "Claude",
    ci: "bezig",
    failed: [],
    review: "geen",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 88,
    del: 24,
    created: [0, 18, 2],
    updatedMin: 12,
    assignees: ["octocat"],
    reviewers: [],
    comments: 0,
  },
  {
    id: "ken192",
    repo: "acme/knowledge-base",
    nr: 192,
    title: "feat(extension): maak de extensie downloadbaar in productie",
    head: "feat/extension-download",
    base: "main",
    author: "monalisa",
    ci: "groen",
    failed: [],
    review: "goedgekeurd",
    draft: false,
    mergeable: "kan",
    prio: 2,
    add: 56,
    del: 8,
    created: [3, 9, 30],
    updatedMin: 180,
    assignees: [],
    reviewers: [["octocat", "goedgekeurd"]],
    comments: 3,
    aRuns: [["codex", "comments", 1, 0, 120]],
  },
  {
    id: "klf594",
    repo: "acme/portal-frontend",
    nr: 594,
    title: "[fix] WEB-105: filter Cloudinary-fetch ruis in Sentry",
    head: "codex/web-105-sentry-ruis",
    base: "main",
    author: "Codex",
    ci: "rood",
    failed: ["unit (vitest)"],
    review: "changes",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 22,
    del: 6,
    created: [1, 21, 16],
    updatedMin: 240,
    assignees: ["octocat"],
    reviewers: [["octocat", "changes"]],
    comments: 11,
    aRuns: [
      ["codex", "fixes", 3, 2, 240],
      ["claude", "comments", 2, 0, 180],
    ],
  },
  {
    id: "klf596",
    repo: "acme/portal-frontend",
    nr: 596,
    title: "WEB-109: [Sentry] filter telefoon-hasOwnProperty TypeError",
    head: "claude/web-109-hasownproperty",
    base: "main",
    author: "Claude",
    ci: "groen",
    failed: [],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 18,
    del: 4,
    created: [0, 19, 55],
    updatedMin: 25,
    assignees: [],
    reviewers: [
      ["octocat", "gevraagd"],
      ["monalisa", "gevraagd"],
    ],
    comments: 1,
  },
  {
    id: "klp427",
    repo: "acme/portal-projects",
    nr: 427,
    title: "fix: WEB-20 vang Sanity-timeout af op de 404-pagina",
    head: "fix/web-20-sanity-timeout",
    base: "main",
    author: "octocat",
    ci: "rood",
    failed: ["build / next"],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 31,
    del: 9,
    created: [0, 20, 3],
    updatedMin: 9,
    assignees: ["octocat"],
    reviewers: [["monalisa", "gevraagd"]],
    comments: 3,
    aRuns: [["claude", "comments", 3, 0, 20]],
  },
  {
    id: "klp428",
    repo: "acme/portal-projects",
    nr: 428,
    title: "fix(sanity): retry transiënte fetch-fouten in sanityFetch (WEB-14)",
    head: "fix/web-14-sanity-retry",
    base: "main",
    author: "hubot",
    ci: "rood",
    failed: ["build / next", "types / tsc"],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 74,
    del: 21,
    created: [1, 16, 40],
    updatedMin: 300,
    assignees: [],
    reviewers: [["octocat", "gevraagd"]],
    comments: 5,
  },
  {
    id: "mee58",
    repo: "acme/waste-portal",
    nr: 58,
    title: "fix(formulier): valideer postcode server-side",
    head: "fix/postcode-validatie",
    base: "main",
    author: "monalisa",
    ci: "groen",
    failed: [],
    review: "gevraagd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 41,
    del: 11,
    created: [2, 13, 12],
    updatedMin: 360,
    assignees: [],
    reviewers: [["octocat", "gevraagd"]],
    comments: 2,
    aRuns: [["codex", "fixes", 2, 1, 300]],
  },
  {
    id: "nts112",
    repo: "acme/careers-site",
    nr: 112,
    title: "chore: verhoog de cache-tijd van de vacatures-feed",
    head: "chore/cache-vacatures",
    base: "main",
    author: "hubot",
    ci: "groen",
    failed: [],
    review: "goedgekeurd",
    draft: false,
    mergeable: "kan",
    prio: null,
    add: 6,
    del: 2,
    created: [1, 8, 20],
    updatedMin: 370,
    assignees: ["octocat"],
    reviewers: [["monalisa", "goedgekeurd"]],
    comments: 1,
  },
];

function toPullRequest(raw: RawPr): PullRequest {
  const repoId = toRepoId(raw.repo);
  const reviewers: Reviewer[] = raw.reviewers.map(([login, state]) => ({
    login,
    state: reviewerState(state),
  }));
  return {
    id: raw.id,
    repoId,
    number: toPrNumber(raw.nr),
    title: raw.title,
    url: `https://github.com/${raw.repo}/pull/${raw.nr}`,
    headRef: raw.head,
    baseRef: raw.base,
    author: deriveAuthor(raw.author),
    ciStatus: ci(raw.ci, raw.failed),
    reviewState: review(raw.review),
    isDraft: raw.draft,
    mergeable: mergeable(raw.mergeable),
    priority: raw.prio,
    createdAt: daysAgo(...raw.created),
    updatedAt: minutesAgo(raw.updatedMin),
    additions: raw.add,
    deletions: raw.del,
    comments: raw.comments,
    reviewers,
    agentReviews: (raw.aRuns ?? []).map(agentRun),
    assignees: raw.assignees,
    reviewRequestedFromMe: reviewers.some(
      (r) => r.login === MOCK_ME && r.state === "pending",
    ),
    assignedToMe: raw.assignees.includes(MOCK_ME),
    authoredByMe: raw.author === MOCK_ME,
  };
}

export const MOCK_PRS: PullRequest[] = RAW_PRS.map(toPullRequest);
