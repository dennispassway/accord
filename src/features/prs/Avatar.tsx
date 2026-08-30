import type { Author } from "../../lib/github/domain";
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
    </span>
  );
}
