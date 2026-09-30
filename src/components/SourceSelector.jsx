import { useState, useEffect, useRef } from "react";
import { PLAYER_SOURCES } from "../utils/api";
import { storage, STORAGE_KEYS } from "../utils/storage";

export function SourceSelector({
  playerSource,
  onSelect,
  onClose,
  isMovie,
  itemId,
  dubMode,
  clearFailover,
  clearEmbedFirst,
}) {
  const panelRef = useRef(null);
  const [localSource, setLocalSource] = useState(playerSource);

  useEffect(() => {
    setLocalSource(playerSource);
  }, [playerSource]);

  const handleSelect = (src) => {
    if (src.id === localSource) return;
    setLocalSource(src.id);
    if (clearFailover) clearFailover(src.id);
    if (clearEmbedFirst) clearEmbedFirst(src.id);
    onSelect(src.id);
    onClose();
  };

  const getSourceColors = (src) => {
    const isActive = src.id === localSource;
    return {
      bg: isActive ? "rgba(229, 9, 20, 0.15)" : "transparent",
      border: isActive ? "1px solid var(--red)" : "1px solid transparent",
      text: isActive ? "var(--red)" : "var(--text)",
      checkColor: isActive ? "var(--red)" : "transparent",
    };
  };

  return (
    <div className="source-panel" role="dialog" aria-label="Select source">
      <div className="source-panel__header">
        <h3 className="source-panel__title">Select Source</h3>
        <button
          className="source-panel__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="source-panel__content">
        <div className="source-panel__list" role="listbox" aria-label="Available sources">
          {PLAYER_SOURCES.map((src) => {
            const colors = getSourceColors(src);
            return (
              <button
                key={src.id}
                role="option"
                aria-selected={src.id === localSource}
                className="source-panel__item"
                onClick={() => handleSelect(src)}
                style={{
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                  color: colors.text,
                }}
              >
                <span className="source-panel__item-label">{src.label}</span>
                {src.tag && (
                  <span className="source-panel__tag">{src.tag}</span>
                )}
                <span
                  className="source-panel__check"
                  style={{ color: colors.checkColor }}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="source-panel__footer">
        <span className="source-panel__count">
          {PLAYER_SOURCES.length} sources available
        </span>
      </div>
    </div>
  );
}

export default SourceSelector;