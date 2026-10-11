import { useState } from "react";
import type { Author } from "../../lib/github/domain";
import { mockMode } from "../../lib/mock/mode";
import { AgentIcon } from "./icons";

/**
 * Deterministische oklch-achtergrond uit de login (L .56-.60, C .10-.12,
 * H via een simpele stringhash), portie van het `av()`/`AVBG`-palet uit
 * het design-script.
 */
export function avatarBg(login: string): string {
  return `oklch(.58 .11 ${hueOf(login)})`;
}

/** Verzadigde variant voor de repo-dots in de sidebar (Strak: 9px, vol van kleur). */
export function repoDotBg(repoId: string): string {
  return `oklch(.7 .19 ${hueOf(repoId)})`;
}

function hueOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

interface AvatarProps {
  author: Author;
  size: number;
}

export function Avatar({ author, size }: AvatarProps) {
  const bg = avatarBg(author.login);
  const style = { width: size, height: size, background: bg };

  if (author.kind === "agent") {
    return (
      <span
        className="pr-avatar pr-avatar-agent"
        style={style}
        title={`${author.login} (agent)`}
      >
        <AgentIcon size={Math.round(size * 0.6)} />
      </span>
    );
  }

  return (
    <span
      className="pr-avatar pr-avatar-human"
      style={style}
      title={author.login}
    >
      {author.login.charAt(0).toUpperCase()}
      <AvatarImage login={author.login} size={size} />
    </span>
  );
}

/**
 * GitHub-avatar op basis van de login, over de initiaal heen. Die initiaal
 * blijft staan tijdens het laden en als de afbeelding niet laadt (offline,
 * onbekende login). In mockmodus geen URL: de fixtures zijn fictief en
 * mogen geen echt profiel tonen.
 */
export function avatarUrl(login: string, size: number): string | null {
  if (mockMode() !== "off") return null;
  // 2x voor retina; de CSP staat alleen deze host toe (tauri.conf.json).
  return `https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=${size * 2}`;
}

export function AvatarImage({ login, size }: { login: string; size: number }) {
  const url = avatarUrl(login, size);
  // Op de URL, niet op een boolean: hergebruikt React deze instantie voor
  // een andere login, dan krijgt die een nieuwe kans.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (url == null || url === failedUrl) return null;
  return (
    <img
      className="avatar-img"
      src={url}
      alt=""
      draggable={false}
      onError={() => setFailedUrl(url)}
    />
  );
}
