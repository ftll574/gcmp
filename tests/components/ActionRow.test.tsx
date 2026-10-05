import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { ActionRow } from '../../src/components/ActionRow.tsx';
import { setLocale } from '../../src/i18n/locale-state.ts';

afterEach(() => {
  cleanup();
  setLocale('en');
});

test('empty-plan actions explain why they are unavailable and remain safely inert', () => {
  setLocale('en');
  const onSave = vi.fn();
  render(
    <ActionRow
      shareUrl={null}
      canSave={false}
      onSave={onSave}
      result={null}
      routing={{ groups: [{ legs: [] }], cabin: 'economy', programs: [] }}
    />,
  );

  const save = screen.getByRole('button', { name: 'Save' });
  const share = screen.getByRole('button', { name: 'Share URL' });
  const copyText = screen.getByRole('button', { name: 'Copy text' });
  for (const button of [save, share, copyText]) {
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button.tabIndex).toBe(0);
    const reasonId = button.getAttribute('aria-describedby');
    expect(reasonId).toBeTruthy();
    expect(document.getElementById(reasonId!)).not.toBeEmptyDOMElement();
    fireEvent.click(button);
  }

  expect(document.querySelector('.action-row-disabled-reason')).toHaveTextContent(
    'No route segments yet. Add the first segment to enable these actions.',
  );
  expect(onSave).not.toHaveBeenCalled();
});
