import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StarButton } from './StarButton';

const ID = 'a'.repeat(32);

describe('StarButton', () => {
  it('renders nothing without a channel id', () => {
    const { container } = render(<StarButton channelId={null} isFavorite={false} onToggle={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('offers to add when not a favorite', () => {
    const onToggle = vi.fn();
    render(<StarButton channelId={ID} isFavorite={false} onToggle={onToggle} />);
    const b = screen.getByRole('button', { name: '즐겨찾기에 추가' });
    expect(b.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(b);
    expect(onToggle).toHaveBeenCalledWith(ID);
  });

  it('offers to remove when it is a favorite', () => {
    render(<StarButton channelId={ID} isFavorite onToggle={vi.fn()} />);
    const b = screen.getByRole('button', { name: '즐겨찾기에서 제거' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
  });
});
