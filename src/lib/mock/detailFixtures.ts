/**
 * Mockdata voor de PR-inspector-overlay (diff + comments) in de dev-
 * mockmodus, gekeyed op `${repoId}#${number}` zoals keyOfPr/prKeyOf elders in
 * de app. Handgeschreven diffs, geen echte GitHub-call.
 */
import { deriveAuthor } from "../github/domain";
import type { PrComment, PrDetail, ReviewThread } from "../github/prDetail";

function comment(
  login: string,
  bodyText: string,
  createdAt: string,
  body: string = bodyText,
): PrComment {
  return { author: deriveAuthor(login), bodyText, body, createdAt };
}

// Toont alle markdown-vormen die CommentsView moet renderen: inline code,
// een codeblok, een lijst, een link en een afbeelding (die als tekstlink
// verschijnt, want de CSP staat alleen img-src 'self' data: toe).
const MARKDOWN_DEMO_BODY = `\`xargs -r rm -rf\` op basis van \`ls -1t\` voelt kwetsbaar als een releasemap een spatie in de naam heeft.

Kort overzicht van wat ik checkte:
- releasemappen zijn timestamps, dus geen spaties
- \`find -print0\` zou robuuster zijn maar is hier niet nodig
- de restart-regel in deploy.sh blijft ongemoeid

\`\`\`bash
find "$RELEASES_DIR" -maxdepth 1 -mindepth 1 | sort
\`\`\`

Zie ook de [GNU findutils-docs](https://www.gnu.org/software/findutils/) voor de -print0-vlag.

![Voorbeeld van de output](https://example.com/screenshot.png)`;

// Bot-reactie zoals Vercel die plaatst: rauwe HTML met een geneste
// <picture>/<source>/<img> en een tabel, geen echte markdown. Laat zien dat
// CommentBody die opschoont in plaats van de markup letterlijk te tonen.
const VERCEL_BOT_BODY = `<a href="https://vercel.com/acme/storefront"><sup><img src="https://vercel.com/api/www/avatar?u=acme&s=16" width="16" height="16" align="middle" alt="" /></sup></a> **storefront** – [Bekijk preview](https://storefront-git-hoc49-acme.vercel.app)

| Project | Deployment | Actions | Updated (UTC) |
| --- | --- | --- | --- |
| **storefront** | <a href="https://vercel.com/acme/storefront/hoc49abc">Ready</a> ([Inspect](https://vercel.com/acme/storefront/hoc49abc)) | <a href="https://vercel.com/acme/storefront/hoc49abc" rel="noreferrer"><picture><source media="(prefers-color-scheme: dark)" srcset="https://vercel.com/button-dark.svg"><img src="https://vercel.com/button-light.svg" alt="Request Review"></picture></a> | Sep 23, 2026 2:14pm |
`;

let threadCounter = 0;

function thread(
  path: string,
  line: number | null,
  isResolved: boolean,
  comments: PrComment[],
): ReviewThread {
  threadCounter += 1;
  return {
    id: `mock-thread-${threadCounter}`,
    path,
    line,
    isResolved,
    viewerCanReply: !isResolved,
    viewerCanResolve: !isResolved,
    viewerCanUnresolve: isResolved,
    comments,
  };
}

const KEN167_DIFF = `diff --git a/deploy/deploy.sh b/deploy/deploy.sh
index a1b2c3d..e4f5a6b 100644
--- a/deploy/deploy.sh
+++ b/deploy/deploy.sh
@@ -12,14 +12,15 @@ set -euo pipefail

 REMOTE_DIR="/var/www/knowledge-base"
+RELEASE_DIR="$REMOTE_DIR/releases/$(date +%Y%m%d%H%M%S)"

-rsync -az --delete build/ "$REMOTE_HOST:$REMOTE_DIR/"
+mkdir -p "$RELEASE_DIR"
+rsync -az build/ "$REMOTE_HOST:$RELEASE_DIR/"
+ssh "$REMOTE_HOST" "ln -sfn $RELEASE_DIR $REMOTE_DIR/current"

-ssh "$REMOTE_HOST" "systemctl restart knowledge-base"
+ssh "$REMOTE_HOST" "systemctl restart knowledge-base && bash $REMOTE_DIR/current/deploy/prune-releases.sh"
diff --git a/deploy/prune-releases.sh b/deploy/prune-releases.sh
new file mode 100644
index 0000000..7c8d9e0
--- /dev/null
+++ b/deploy/prune-releases.sh
@@ -0,0 +1,9 @@
+#!/usr/bin/env bash
+set -euo pipefail
+
+RELEASES_DIR="/var/www/knowledge-base/releases"
+KEEP=5
+
+cd "$RELEASES_DIR"
+ls -1t | tail -n +$((KEEP + 1)) | xargs -r rm -rf
diff --git a/deploy/README.md b/deploy/README.md
index 5566778..99aabbc 100644
--- a/deploy/README.md
+++ b/deploy/README.md
@@ -3,7 +3,8 @@
 ## Deploy-strategie

-Elke deploy synct de build direct naar de live-map via rsync.
+Elke deploy zet een nieuwe releases-map neer en verwijst de current-symlink
+daarnaar. \`prune-releases.sh\` ruimt oude releases op (behoudt de laatste 5).
`;

const HOC49_DIFF = `diff --git a/src/modules/b2bPartner/portal.ts b/src/modules/b2bPartner/portal.ts
index 1122334..4455667 100644
--- a/src/modules/b2bPartner/portal.ts
+++ b/src/modules/b2bPartner/portal.ts
@@ -8,10 +8,18 @@ import { requireRole } from "../../auth/requireRole";
 export async function createPartnerPortal(partnerId: string) {
   const partner = await Partner.findById(partnerId);
   if (!partner) throw new NotFoundError("Partner niet gevonden");
-  return buildPortalConfig(partner);
+  const config = buildPortalConfig(partner);
+  await PortalAudit.log(partnerId, "portal_created");
+  return config;
 }
+
+export async function suspendPartnerPortal(partnerId: string) {
+  await requireRole("admin");
+  await Partner.updateOne({ _id: partnerId }, { portalSuspended: true });
+  await PortalAudit.log(partnerId, "portal_suspended");
+}
diff --git a/src/modules/b2bPartner/webhooks.ts b/src/modules/b2bPartner/webhooks.ts
new file mode 100644
index 0000000..8899aab
--- /dev/null
+++ b/src/modules/b2bPartner/webhooks.ts
@@ -0,0 +1,14 @@
+import type { Request, Response } from "express";
+import { verifySignature } from "./webhookSignature";
+
+export async function handlePartnerWebhook(req: Request, res: Response) {
+  const signature = req.headers["x-partner-signature"];
+  if (!verifySignature(req.rawBody, signature)) {
+    res.status(401).json({ error: "invalid signature" });
+    return;
+  }
+  await enqueueWebhookEvent(req.body);
+  res.status(202).end();
+}
diff --git a/src/modules/b2bPartner/invoice.ts b/src/modules/b2bPartner/invoice.ts
index 33445566..77889900 100644
--- a/src/modules/b2bPartner/invoice.ts
+++ b/src/modules/b2bPartner/invoice.ts
@@ -21,7 +21,7 @@ export async function generateInvoice(partnerId: string, period: Period) {
   const lines = await collectInvoiceLines(partnerId, period);
-  const total = lines.reduce((sum, line) => sum + line.amount, 0);
+  const total = lines.reduce((sum, line) => sum + line.amountExclVat, 0);
   return { partnerId, period, lines, total };
 }
`;

export const MOCK_PR_DETAILS: Record<string, PrDetail> = {
  "acme/knowledge-base#167": {
    diff: KEN167_DIFF,
    diffTooLarge: false,
    issueComments: [
      comment(
        "monalisa",
        "Deploy-tijd gaat van ~40s naar ~45s door de extra symlink-stap, maar we winnen atomische releases en een instant rollback. Lijkt me een goede ruil.",
        "2026-07-28T09:14:00Z",
      ),
      comment(
        "octocat",
        "Prune-script staat los van de deploy-hook. Draait dat via cron of hangt 'ie aan de restart?",
        "2026-07-28T10:02:00Z",
      ),
      comment(
        "monalisa",
        "Hangt aan de restart-regel in deploy.sh, zie de laatste hunk. Cron voegt een dependency toe die ik hier niet wilde.",
        "2026-07-28T10:20:00Z",
      ),
    ],
    reviewThreads: [
      thread("deploy/prune-releases.sh", 8, false, [
        comment(
          "octocat",
          "xargs -r rm -rf op basis van ls -1t voelt kwetsbaar als een releasemap een spatie in de naam heeft. Onze releasemappen zijn timestamps, dus prima, maar leg dat aan als comment vast.",
          "2026-07-28T10:05:00Z",
          MARKDOWN_DEMO_BODY,
        ),
      ]),
      thread("deploy/deploy.sh", 15, true, [
        comment(
          "monalisa",
          "RELEASE_DIR gebruikt nu date +%Y%m%d%H%M%S, dat kan botsen bij twee deploys binnen dezelfde seconde. Voeg ik een korte random suffix aan toe.",
          "2026-07-28T09:40:00Z",
        ),
        comment(
          "monalisa",
          "Toegevoegd in de laatste commit, seconde-botsing kan nu niet meer.",
          "2026-07-28T09:55:00Z",
        ),
      ]),
    ],
  },
  "acme/storefront#49": {
    diff: HOC49_DIFF,
    diffTooLarge: false,
    issueComments: [
      comment(
        "hubot",
        "Grote PR, maar de module hangt logisch samen: portal, facturatie en webhook-API delen dezelfde partner-audit-log. Splitsen zou de review niet makkelijker maken.",
        "2026-07-27T14:00:00Z",
      ),
      comment(
        "octocat",
        "E2E faalt op chromium, even kijken of dat aan deze PR ligt of aan de runner.",
        "2026-07-27T15:30:00Z",
      ),
      comment(
        "vercel[bot]",
        "storefront: Ready, bekijk de preview.",
        "2026-07-27T15:45:00Z",
        VERCEL_BOT_BODY,
      ),
    ],
    reviewThreads: [
      thread("src/modules/b2bPartner/webhooks.ts", 6, false, [
        comment(
          "octocat",
          "verifySignature met req.rawBody: staat de raw-body-parser al aan voor deze route, of moet dat nog in de Express-config?",
          "2026-07-27T15:10:00Z",
        ),
      ]),
      thread("src/modules/b2bPartner/invoice.ts", 24, true, [
        comment(
          "hubot",
          "amount -> amountExclVat was een bug, de factuurtotalen klopten niet met BTW erin. Fix zit in deze regel.",
          "2026-07-27T14:20:00Z",
        ),
        comment(
          "octocat",
          "Goede vangst, klopt met het support-ticket van vorige week.",
          "2026-07-27T14:35:00Z",
        ),
      ]),
    ],
  },
};

export const MOCK_PR_DETAIL_FALLBACK: PrDetail = {
  diff: `diff --git a/README.md b/README.md
index abc1234..def5678 100644
--- a/README.md
+++ b/README.md
@@ -1,3 +1,3 @@
 # Project

-Oude beschrijving.
+Nieuwe beschrijving.
`,
  diffTooLarge: false,
  issueComments: [],
  reviewThreads: [],
};
