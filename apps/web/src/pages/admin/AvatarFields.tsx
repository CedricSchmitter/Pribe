import { AVATAR_COLORS, AVATAR_EMOJIS } from './palette';

type Look = { emoji: string; color: string };

/** Emoji and color pickers, shared by persons and the surprise guest (R90). */
export function AvatarFields({ value, onChange }: { value: Look; onChange(patch: Partial<Look>): void }) {
  return (
    <>
      <div className="stack-tight">
        <span className="label">Emoji</span>
        <div className="emoji-grid" role="radiogroup" aria-label="Emoji">
          {AVATAR_EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              role="radio"
              aria-checked={value.emoji === em}
              className={`emoji-choice${value.emoji === em ? ' selected' : ''}`}
              onClick={() => onChange({ emoji: em })}
            >
              {em}
            </button>
          ))}
        </div>
        <label className="inline-field">
          <span className="muted">Eigenes:</span>
          <input
            className="emoji-input"
            value={value.emoji}
            maxLength={16}
            onChange={(e) => onChange({ emoji: e.target.value })}
          />
        </label>
      </div>

      <div className="stack-tight">
        <span className="label">Farbe</span>
        <div className="color-grid" role="radiogroup" aria-label="Farbe">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={value.color.toLowerCase() === c}
              aria-label={c}
              className={`color-choice${value.color.toLowerCase() === c ? ' selected' : ''}`}
              style={{ background: c }}
              onClick={() => onChange({ color: c })}
            />
          ))}
          <label className="color-custom" title="Eigene Farbe">
            <input type="color" value={value.color} onChange={(e) => onChange({ color: e.target.value })} />
            <span aria-hidden="true">🎨</span>
          </label>
        </div>
      </div>
    </>
  );
}
