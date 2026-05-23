/**
 * Glossary tooltip — wraps a jargon term with a hover/focus popover that
 * shows the localized definition.
 *
 *   <Glossary term="pqm">PQM</Glossary>
 */

import { useState, useId, type ReactNode } from 'react';
import { useLocale } from '../i18n/use-locale.ts';

interface Props {
  /** Glossary key — matches `glossary.<term>` in the locale file. */
  term: string;
  children: ReactNode;
}

export function Glossary({ term, children }: Props): React.ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const id = useId();

  const definition = t(`glossary.${term}`);
  return (
    <span
      className="glossary"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-describedby={open ? id : undefined}
    >
      <span className="glossary-term">{children}</span>
      {open && (
        <span id={id} role="tooltip" className="glossary-popover">
          {definition}
        </span>
      )}
    </span>
  );
}
