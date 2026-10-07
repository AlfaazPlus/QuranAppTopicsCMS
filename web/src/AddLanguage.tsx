import { COMMON_LANGUAGES } from "./languages";
import { useStore } from "./store";

export function AddLanguage({ onClose }: { onClose: () => void }) {
  const { addLanguage, languages } = useStore();
  const existing = languages.map((l) => l.code);
  const options = COMMON_LANGUAGES.filter((l) => !existing.includes(l.code));

  return (
    <div className="modal" onClick={onClose}>
      <div className="dialog wide" onClick={(e) => e.stopPropagation()}>
        <h3>Add a language</h3>
        {options.length ? (
          <div className="lang-grid">
            {options.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  addLanguage(l);
                  onClose();
                }}
              >
                {l.name}
                <small dir={l.dir}>{l.native}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">All available languages are already added.</p>
        )}
        <div className="row end">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
