/**
 * Glossary tooltip — wraps a jargon term with a hover/focus popover that
 * shows the localized definition. Only renders the underline + tooltip
 * affordance when the app is in Beginner mode; in Pro mode it renders the
 * plain term with no decoration.
 *
 *   <Glossary term="pqm">PQM</Glossary>
 *   <Glossary term="pqm" mode="pro">PQM</Glossary>  // plain text
 */

import { useState, useId, type ReactNode } from 'react';
import { useLocale } from '../i18n/use-locale.ts';

interface Props {
  /** Glossary key — matches `glossary.<term>` in the locale file. */
  term: string;
  children: ReactNode;
  /** Force "pro" rendering (no decoration) even when app is in beginner mode. */
  mode?: 'beginner' | 'pro';
}

export function Glossary({ term, children, mode = 'beginner' }: Props): React.ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const id = useId();

  if (mode === 'pro') {
    return <span className="glossary-pro">{children}</span>;
  }

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
