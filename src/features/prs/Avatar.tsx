import type { Author } from "../../lib/github/domain";
import { AgentIcon } from "./icons";

/**
 * Deterministische oklch-achtergrond uit de login (L .56-.60, C .10-.12,
 * H via een simpele stringhash), portie van het `av()`/`AVBG`-palet uit
 * het design-script.
 */
export function avatarBg(login: string): string {
  let hash = 0;
  for (let i = 0; i < login.length; i++) {
    hash = (hash * 31 + login.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(.58 .11 ${hue})`;
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
