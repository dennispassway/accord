import { useEffect } from "react";
import { CheckIcon } from "./icons";
import { useRovingMenu } from "./menuNav";
import {
  displayLogin,
  PERSON_ROLE_LABEL,
  PERSON_ROLES,
  type PersonFilter,
  type PersonOption,
} from "./personFilter";
import "./sortmenu.css";

interface PersonMenuProps {
  filter: PersonFilter;
  people: PersonOption[];
  me: string;
  onChange: (filter: PersonFilter) => void;
  onClose: () => void;
}

/** Een rol kiezen houdt het menu open (de personenlijst wisselt mee), een
 * persoon kiezen sluit het. */
export function PersonMenu({
  filter,
  people,
  me,
  onChange,
  onClose,
}: PersonMenuProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // `login: null` is "Iedereen", zonder telling.
  const choices: { login: string | null; count?: number }[] = [
    { login: null },
    ...people,
  ];
  const { setItemRef, handleKeyDown, tabIndexFor } = useRovingMenu(
    PERSON_ROLES.length + choices.length,
    PERSON_ROLES.length +
      Math.max(
        choices.findIndex((choice) => choice.login === filter.login),
        0,
      ),
  );

  return (
    <>
      <button
        type="button"
        className="sort-menu-overlay"
        aria-label="Sluit filtermenu"
        onClick={onClose}
      />
      <div className="sort-menu" role="menu" onKeyDown={handleKeyDown}>
        <div className="sort-menu-heading mono">Rol</div>
        {PERSON_ROLES.map((role, index) => (
          <button
            key={role}
            type="button"
            role="menuitemradio"
            aria-checked={role === filter.role}
            ref={setItemRef(index)}
            tabIndex={tabIndexFor(index)}
            className="sort-menu-item"
            onClick={() => onChange({ ...filter, role })}
          >
            <span className="sort-menu-check">
              {role === filter.role && <CheckIcon size={11} />}
            </span>
            <span className="sort-menu-label">{PERSON_ROLE_LABEL[role]}</span>
          </button>
        ))}
        <div className="sort-menu-separator" />
        {choices.map(({ login, count }, offset) => {
          const index = PERSON_ROLES.length + offset;
          return (
            <button
              key={login ?? ""}
              type="button"
              role="menuitemradio"
              aria-checked={login === filter.login}
              ref={setItemRef(index)}
              tabIndex={tabIndexFor(index)}
              className="sort-menu-item"
              onClick={() => {
                onChange({ ...filter, login });
                onClose();
              }}
            >
              <span className="sort-menu-check">
                {login === filter.login && <CheckIcon size={11} />}
              </span>
              <span className="sort-menu-label">
                {login == null ? "Iedereen" : displayLogin(login, me)}
                {login === me && (
                  <span className="sort-menu-sub"> {login}</span>
                )}
              </span>
              {count != null && (
                <span className="sort-menu-kbd mono">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
