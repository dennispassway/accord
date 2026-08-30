import type { ReviewAgent } from "../features/agents/crossReview";

/** Rijke, taalgevoelige teksten horen niet op het aanroeppunt: één plek voor
 * de agentnaam die de gebruiker ziet. */
const AGENT_LABEL: Record<ReviewAgent, string> = {
  claude: "Claude",
  codex: "Codex",
};

export type NotificationEvent =
  | {
      type: "runFinished";
      agent: ReviewAgent;
      prKey: string;
      prNumber: number;
      status: "done" | "failed";
      /** Alleen bekend als de run-data ze levert; ontbreken ze, dan valt de
       * tekst terug op alleen agent + PR-nummer (zie notifications.test.ts). */
      commentCount?: number;
      commitCount?: number;
    }
  | { type: "ciFlippedRed"; prKey: string; prNumber: number; repoName: string }
  | {
      type: "mergeCompleted";
      prKey: string;
      prNumber: number;
      repoName: string;
    };

export interface NotificationContext {
  /** De instelling "Notificaties" (settings.notifications). */
  enabled: boolean;
  /** True zolang de gebruiker naar het venster kijkt: dan is een systeem-
   * notificatie overbodig, de app toont het zelf al (toast/lijst). */
  windowFocused: boolean;
}

export interface NotificationPayload {
  title: string;
  body: string;
  /** `${repoId}#${prNumber}`: waar een klik op de notificatie naartoe springt. */
  prKey: string;
}

function plural(count: number, singular: string, pluralWord: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralWord}`;
}

function runFinishedBody(
  commentCount: number | undefined,
  commitCount: number | undefined,
): string {
  const parts: string[] = [];
  if (commentCount != null) {
    parts.push(plural(commentCount, "opmerking", "opmerkingen"));
  }
  if (commitCount != null) {
    parts.push(plural(commitCount, "fix-commit", "fix-commits"));
  }
  return parts.join(", ");
}

/**
 * Bepaalt uit een event en de huidige context (instelling aan/uit, venster
 * gefocust of niet) of er een systeemnotificatie moet komen, en zo ja welke.
 * Pure functie, geen I/O: de aanroeper (notify.ts) stuurt de payload pas echt
 * naar het OS.
 */
export function decideNotification(
  event: NotificationEvent,
  context: NotificationContext,
): NotificationPayload | null {
  if (!context.enabled || context.windowFocused) return null;

  switch (event.type) {
    case "runFinished": {
      const agentLabel = AGENT_LABEL[event.agent];
      if (event.status === "failed") {
        return {
          title: `${agentLabel} is mislukt op #${event.prNumber}`,
          body: "",
          prKey: event.prKey,
        };
      }
      return {
        title: `${agentLabel} is klaar met #${event.prNumber}`,
        body: runFinishedBody(event.commentCount, event.commitCount),
        prKey: event.prKey,
      };
    }
    case "ciFlippedRed":
      return {
        title: `CI faalt op #${event.prNumber}`,
        body: event.repoName,
        prKey: event.prKey,
      };
    case "mergeCompleted":
      return {
        title: `#${event.prNumber} gemerged`,
        body: event.repoName,
        prKey: event.prKey,
      };
  }
}
