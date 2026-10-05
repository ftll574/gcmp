import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test } from 'vitest';
import { LanguagePicker } from '../../src/components/LanguagePicker.tsx';
import { setLocale } from '../../src/i18n/locale-state.ts';

afterEach(() => {
  cleanup();
  setLocale('en');
  window.history.replaceState({}, '', '/');
});

test('language selection updates the URL locale while preserving route and share state', () => {
  window.history.replaceState({}, '', '/gcmp/?view=routes&lang=zh-TW&entity=airport&id=TPE#/r/v1/TPE-NRT?op=BR');
  setLocale('zh-TW');
  render(<LanguagePicker />);

  fireEvent.click(screen.getByRole('button', { name: '語言: 繁體中文' }));
  const listbox = screen.getByRole('listbox', { name: '語言' });
  expect(listbox).toHaveFocus();
  expect(screen.getByRole('option', { name: '繁體中文' })).toHaveAttribute('aria-selected', 'true');

  fireEvent.click(screen.getByRole('option', { name: 'English' }));
  expect(screen.getByRole('button', { name: 'Language: English' })).toBeInTheDocument();
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  const url = new URL(window.location.href);
  expect(url.searchParams.get('lang')).toBe('en');
  expect(url.searchParams.get('view')).toBe('routes');
  expect(url.searchParams.get('entity')).toBe('airport');
  expect(url.searchParams.get('id')).toBe('TPE');
  expect(url.hash).toBe('#/r/v1/TPE-NRT?op=BR');
});

test('picker supports arrow keys, Enter, Escape, and outside dismissal', () => {
  setLocale('zh-TW');
  render(<LanguagePicker />);
  const trigger = screen.getByRole('button', { name: '語言: 繁體中文' });

  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const listbox = screen.getByRole('listbox', { name: '語言' });
  expect(listbox).toHaveFocus();
  expect(listbox).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-1'));
  fireEvent.keyDown(listbox, { key: 'ArrowDown' });
  expect(listbox).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-0'));
  fireEvent.keyDown(listbox, { key: 'Enter' });
  expect(screen.getByRole('button', { name: 'Language: English' })).toHaveFocus();
  expect(new URLSearchParams(window.location.search).get('lang')).toBe('en');

  fireEvent.click(screen.getByRole('button', { name: 'Language: English' }));
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Language: English' })).toHaveFocus();

  fireEvent.click(screen.getByRole('button', { name: 'Language: English' }));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
