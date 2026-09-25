import { Building2, PanelsTopLeft } from 'lucide-react';
import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { PresentationMode } from '@h2a/contracts';

interface PresentationModeSwitchProps {
  mode: PresentationMode;
  disabled?: boolean;
  onModeChange(mode: PresentationMode): void;
}

const modes: PresentationMode[] = ['office', 'control'];

export function PresentationModeSwitch({ mode, disabled = false, onModeChange }: PresentationModeSwitchProps): React.JSX.Element {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (event: KeyboardEvent<HTMLButtonElement>, next: PresentationMode): void => {
    event.preventDefault();
    onModeChange(next);
    buttons.current[modes.indexOf(next)]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Home') return move(event, 'office');
    if (event.key === 'End') return move(event, 'control');
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (modes.indexOf(mode) + direction + modes.length) % modes.length;
    move(event, modes[nextIndex]!);
  };

  return (
    <div className="presentation-mode-switch" role="group" aria-label="Presentation mode">
      <button
        data-control-id="presentation.office"
        ref={(node) => { buttons.current[0] = node; }}
        type="button"
        className={mode === 'office' ? 'active' : ''}
        aria-label="Office"
        aria-pressed={mode === 'office'}
        disabled={disabled}
        onClick={() => onModeChange('office')}
        onKeyDown={handleKeyDown}
      >
        <Building2 size={16} aria-hidden="true" />
        <span>Office</span>
      </button>
      <button
        data-control-id="presentation.control"
        ref={(node) => { buttons.current[1] = node; }}
        type="button"
        className={mode === 'control' ? 'active' : ''}
        aria-label="Control"
        aria-pressed={mode === 'control'}
        disabled={disabled}
        onClick={() => onModeChange('control')}
        onKeyDown={handleKeyDown}
      >
        <PanelsTopLeft size={16} aria-hidden="true" />
        <span>Control</span>
      </button>
    </div>
  );
}
