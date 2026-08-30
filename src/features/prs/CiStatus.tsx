import type { PullRequest } from "../../lib/github/domain";
import "./detail.css";
import { AlertIcon, CheckIcon, ClockIcon, RefreshIcon } from "./icons";

function ciLabel(ciStatus: PullRequest["ciStatus"]): string {
  switch (ciStatus.state) {
    case "success":
      return "Alle checks geslaagd";
    case "failure":
      return `${ciStatus.failedChecks.length} ${ciStatus.failedChecks.length === 1 ? "check gefaald" : "checks gefaald"}`;
    case "pending":
      return "Checks draaien";
    case "none":
      return "Geen checks ingesteld";
  }
}

/** CI-kaart: icoon + label, en bij rood de namen van de gefaalde checks. */
export function CiStatus({ ciStatus }: { ciStatus: PullRequest["ciStatus"] }) {
  return (
    <div
      className={
        ciStatus.state === "failure"
          ? "detail-ci detail-card detail-ci-failure"
          : ciStatus.state === "success"
            ? "detail-ci detail-card detail-ci-success"
            : "detail-ci detail-card"
      }
    >
      <div className="detail-ci-head">
        <span className="detail-ci-icon-wrap">
          {ciStatus.state === "success" && (
            <CheckIcon size={13} className="detail-ci-icon-ok" />
          )}
          {ciStatus.state === "failure" && (
            <AlertIcon size={13} className="detail-ci-icon-err" />
          )}
          {ciStatus.state === "pending" && (
            <RefreshIcon className="detail-ci-icon-pending" />
          )}
          {ciStatus.state === "none" && (
            <ClockIcon size={13} className="detail-ci-icon-none" />
          )}
        </span>
        <span className="detail-ci-label">{ciLabel(ciStatus)}</span>
      </div>
      {ciStatus.state === "failure" && (
        <ul className="detail-ci-failed">
          {ciStatus.failedChecks.map((check) => (
            <li key={check}>
              <span className="detail-ci-dot" />
              <span>{check}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
