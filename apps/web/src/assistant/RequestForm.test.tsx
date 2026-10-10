// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestForm } from './RequestForm';

afterEach(cleanup);

describe('the request form', () => {
  it('asks about a school, then a society, then a person, changing the name it asks for', async () => {
    render(<RequestForm onBack={() => undefined} send={() => Promise.resolve('saved')} />);
    expect(screen.getByLabelText('School name')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'A housing society' }));
    expect(screen.getByLabelText('Society name')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'A person or family' }));
    expect(
      screen.queryByLabelText(/name$/u, { selector: '[autocomplete=organization]' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'A person or family' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('says what is missing and sends nothing until it is all there', async () => {
    const send = vi.fn(() => Promise.resolve('saved' as const));
    render(<RequestForm onBack={() => undefined} send={send} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/your name/u);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends what was typed and thanks the person, saying plainly when it was only saved here', async () => {
    const send = vi.fn(() => Promise.resolve('saved' as const));
    render(<RequestForm onBack={() => undefined} send={send} />);
    await userEvent.type(screen.getByLabelText('Your name'), 'Meera');
    await userEvent.type(screen.getByLabelText('School name'), 'Sunrise Public School');
    await userEvent.type(screen.getByLabelText('Area and city'), 'Dwarka, Delhi');
    await userEvent.type(screen.getByLabelText('Email or mobile number'), '9876543210');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Air monitors at our place' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        who: 'school',
        name: 'Meera',
        contact: '9876543210',
        wants: ['demo', 'monitors'],
      }),
    );
    expect(await screen.findByText('Thank you, Meera.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Nothing has been sent yet/u);
  });
});
