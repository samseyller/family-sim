import { useState } from 'react';
import type { PendingChoice } from '../engine/types';

/** An event choice that asks the player to type something (e.g. a baby's name). */
export function TextChoice({ choice, onSubmit }: { choice: PendingChoice; onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const input = choice.input!;
  if (!open) {
    return (
      <button className="choice" disabled={choice.disabled} onClick={() => setOpen(true)}>
        <span>✏️ {choice.label}</span>
        {choice.hint && <span className="hint">{choice.hint}</span>}
      </button>
    );
  }
  return (
    <form
      className="text-choice"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <label className="hint" htmlFor={`tc-${choice.id}`}>{input.label}</label>
      <input
        id={`tc-${choice.id}`}
        type="text"
        value={text}
        maxLength={input.maxLength}
        placeholder={input.placeholder}
        autoFocus
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button type="submit" className="small primary" disabled={!text.trim()}>Use this name</button>
        <button type="button" className="small" onClick={() => setOpen(false)}>Back</button>
      </div>
    </form>
  );
}
