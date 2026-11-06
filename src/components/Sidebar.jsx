import { useState, useRef, useEffect } from "react";
import { imgUrl } from "../utils/api";
import { useSeasonalEvent } from "../components/seasonalEvents.jsx";
import { WatchAlongLogo } from "./Icons";
import {
  NavHomeIcon,
  NavSearchIcon,
  NavLibraryIcon,
  NavDownloadsIcon,
  NavHelpIcon,
  NavSettingsIcon,
  NavBackIcon,
  NavQuitIcon,
  NavPanelIcon,
  NavFilmIcon,
} from "./NavIcons";

const AUTOHIDE_KEY = "watchalongSidebarAutoHide";

export default function Sidebar({
  page,
  onNavigate,
  onSearch,
  savedList,
  activeDownloads,
  onReorderSaved,
  onRemoveSaved,
  canGoBack,
  onBack,
  onShowShortcuts,
}) {
  const [dragOver, setDragOver] = useState(null);
  const dragItem = useRef(null);
  const dragNode = useRef(null);
  const seasonalEvent = useSeasonalEvent();

  const [tooltip, setTooltip] = useState(null); // { title, y }
  const [contextMenu, setContextMenu] = useState(null); // { item, x, y }

  // Auto-hide: the sidebar stays a slim icon strip and slides open while the
  // pointer is over it (or keyboard focus is inside it). Remembered per device.
  const [autoHide, setAutoHide] = useState(() => {
    try {
      return localStorage.getItem(AUTOHIDE_KEY) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("sidebar-autohide", autoHide);
    try {
      localStorage.setItem(AUTOHIDE_KEY, autoHide ? "1" : "0");
    } catch {
      /* storage unavailable: setting just won't persist */
    }
  }, [autoHide]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, []);

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setTooltip(null);
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  const handleDragStart = (e, index) => {
    dragItem.current = index;
    dragNode.current = e.currentTarget;
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    }, 0);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    dragItem.current = null;
    dragNode.current = null;
    setDragOver(null);
  };

  const handleDragEnter = (e, index) => {
    if (dragItem.current === index) return;
    setDragOver(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const fromIndex = dragItem.current;
    if (fromIndex === null || fromIndex === dropIndex) return;

    const newList = [...savedList];
    const [moved] = newList.splice(fromIndex, 1);
    newList.splice(dropIndex, 0, moved);

    const newOrder = newList.map((item) => `${item.media_type}_${item.id}`);
    onReorderSaved(newOrder);
    setDragOver(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  // The floating title tooltip is only needed in the collapsed icon rail,
  // where saved items show as bare posters. CSS hides it when labels show.
  const handleMouseEnter = (e, title) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ title, y: rect.top + rect.height / 2 });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  const openSaved = (item) =>
    onNavigate(item.media_type === "tv" ? "tv" : "movie", item);

  return (
    <nav className="sidebar" aria-label="Main">
      <button
        type="button"
        className="sidebar-logo"
        onClick={() => onNavigate("home")}
        aria-label="WatchAlong home"
      >
        <span className="sidebar-logo-mark">
          <WatchAlongLogo />
          {seasonalEvent && seasonalEvent.render()}
        </span>
        <span className="sidebar-wordmark">WatchAlong</span>
      </button>

      {canGoBack && (
        <SideBtn
          onClick={onBack}
          icon={<NavBackIcon />}
          label="Back"
          hint="Ctrl+Z"
          className="sidebar-btn--back"
        />
      )}

      <SideBtn
        onClick={onSearch}
        icon={<NavSearchIcon />}
        label="Search"
        hint="⌘F"
      />
      <SideBtn
        active={page === "home"}
        onClick={() => onNavigate("home")}
        icon={<NavHomeIcon filled={page === "home"} />}
        label="Home"
      />
      <SideBtn
        active={page === "history"}
        onClick={() => onNavigate("history")}
        icon={<NavLibraryIcon filled={page === "history"} />}
        label="Library"
      />
      <SideBtn
        active={page === "downloads"}
        onClick={() => onNavigate("downloads")}
        icon={<NavDownloadsIcon filled={page === "downloads"} />}
        label="Downloads"
        badge={activeDownloads > 0 ? activeDownloads : null}
      />

      <div className="sidebar-sep" />

      {savedList.length > 0 && (
        <div className="sidebar-heading" id="sidebar-saved-heading">
          Saved
        </div>
      )}

      <div
        className="sidebar-saved"
        aria-labelledby={savedList.length > 0 ? "sidebar-saved-heading" : undefined}
      >
        {savedList.map((item, index) => {
          const key = `${item.media_type}_${item.id}`;
          const title = item.title || item.name;
          const year = (item.release_date || item.first_air_date || "").slice(
            0,
            4,
          );
          return (
            <div
              key={key}
              className={`saved-thumb${dragOver === index ? " drag-over" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={title}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => openSaved(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openSaved(item);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, item)}
              onMouseEnter={(e) => handleMouseEnter(e, title)}
              onMouseLeave={handleMouseLeave}
            >
              <span className="saved-thumb-img">
                {item.poster_path ? (
                  <img
                    src={imgUrl(item.poster_path, "w200")}
                    alt=""
                    width="44"
                    height="66"
                  />
                ) : (
                  <span className="no-img">
                    <NavFilmIcon />
                  </span>
                )}
              </span>
              <span className="saved-thumb-text">
                <span className="saved-thumb-title">{title}</span>
                <span className="saved-thumb-meta">
                  {item.media_type === "tv" ? "Series" : "Movie"}
                  {year ? ` · ${year}` : ""}
                </span>
              </span>
              {dragOver === index && <span className="saved-thumb-drop" />}
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div className="saved-thumb-tooltip" style={{ top: tooltip.y }}>
          {tooltip.title}
        </div>
      )}

      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="sidebar-context-menu-item"
            onClick={() => {
              onRemoveSaved && onRemoveSaved(contextMenu.item);
              setContextMenu(null);
            }}
          >
            Remove from saved
          </button>
        </div>
      )}

      <div className="sidebar-bottom">
        <SideBtn
          onClick={() => setAutoHide((v) => !v)}
          icon={<NavPanelIcon filled={!autoHide} />}
          label="Keep open"
          pressed={!autoHide}
          className="sidebar-btn--mode"
        />
        <SideBtn
          onClick={onShowShortcuts}
          icon={<NavHelpIcon />}
          label="Help"
          hint="?"
        />
        <SideBtn
          active={page === "settings"}
          onClick={() => onNavigate("settings")}
          icon={<NavSettingsIcon filled={page === "settings"} />}
          label="Settings"
        />
        {window.electron?.quitApp && (
          <SideBtn
            onClick={() => window.electron?.quitApp?.()}
            icon={<NavQuitIcon />}
            label="Quit"
            className="sidebar-btn--quit"
          />
        )}
      </div>
    </nav>
  );
}

function SideBtn({
  active,
  onClick,
  icon,
  label,
  hint,
  badge,
  pressed,
  className = "",
}) {
  return (
    <button
      type="button"
      className={`sidebar-btn${active ? " active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-pressed={pressed}
      aria-label={hint ? `${label} (${hint})` : label}
    >
      <span className="sidebar-btn-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sidebar-btn-label" aria-hidden="true">
        {label}
      </span>
      <span className="tooltip" aria-hidden="true">
        {label}
      </span>
      {badge && <span className="sidebar-badge">{badge}</span>}
    </button>
  );
}
