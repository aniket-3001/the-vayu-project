// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import recordedJson from './recorded.json';
import type { Recorded } from './types';
import { WeekBar, momentWords, shortDate } from './WeekBar';

const recorded = recordedJson as unknown as Recorded;

afterEach(cleanup);

describe('the week bar', () => {
  it('says which day it is, in words', () => {
    expect(shortDate('2025-10-07')).toBe('7 Oct');
    const first = recorded.days[0];
    if (first === undefined) throw new Error('no days');
    expect(momentWords(first)).toBe('Tue 7 Oct 2025, 8 am');
  });

  it('has a chip for each day, and steps, plays and leaves', () => {
    const onSelect = vi.fn();
    const onPlay = vi.fn();
    const onLeave = vi.fn();
    render(
      <WeekBar
        recorded={recorded}
        index={1}
        playing={false}
        onSelect={onSelect}
        onPlay={onPlay}
        onLeave={onLeave}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent('21 Oct');
    expect(screen.getByText('The day after Diwali')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(onSelect).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole('tab', { name: /9 Nov/u }));
    expect(onSelect).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: 'Play the week' }));
    expect(onPlay).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Leave the recorded days' }));
    expect(onLeave).toHaveBeenCalled();
  });

  it('tells what the recording is made of, and that stages are an estimate', () => {
    render(
      <WeekBar
        recorded={recorded}
        index={0}
        playing={false}
        onSelect={vi.fn()}
        onPlay={vi.fn()}
        onLeave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'What is this recording' }));
    expect(screen.getByRole('note')).toHaveTextContent('OpenAQ');
    expect(screen.getByRole('note')).toHaveTextContent('unofficial estimate');
  });
});
