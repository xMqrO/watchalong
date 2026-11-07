// Custom Subtitles / Settings panels, subtitle overlay and toast for the CNO
// Vidstack player. State lives in CnoPlayer and arrives through CnoUiContext;
// these components only render it and call its actions.

import { createContext, useContext, useEffect, useState } from "react";
import { useMediaPlayer, useMediaState } from "@vidstack/react";
import { activeCueText, formatTime } from "./subtitles";

export const CnoUiContext = createContext(null);
const useUi = () => useContext(CnoUiContext);

// ── Options ──────────────────────────────────────────────────────────────────
export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export const PICTURE_MODES = {
  Standard: "none",
  Vivid: "saturate(1.35) contrast(1.08)",
  Warm: "sepia(0.15) saturate(1.1)",
  Cool: "hue-rotate(-8deg) saturate(1.05) brightness(1.02)",
  Cinema: "contrast(1.15) brightness(0.92) saturate(0.9)",
};
export const SLEEP_OPTIONS = [null, 15, 30, 45, 60, 90, "end"];
export const BOOST_OPTIONS = [1, 1.5, 2, 3];
export const SUB_STYLE_OPTIONS = {
  size: { Small: 0.8, Medium: 1, Large: 1.25, "Extra large": 1.5 },
  color: { White: "#ffffff", Yellow: "#ffe14d", Cyan: "#6fe3ff", Green: "#7dff8a" },
  background: { Outline: "outline", "Soft box": "soft", "Solid box": "solid" },
  font: { "Sans-serif": "sans", Serif: "serif", Monospace: "mono" },
};
export const DEFAULT_SUB_STYLE = { size: "Medium", color: "White", background: "Outline", font: "Sans-serif" };

const sleepLabel = (v) => (v == null ? "Off" : v === "end" ? "End of video" : `${v} min`);
const speedLabel = (r) => (r === 1 ? "Normal" : `${r}×`);
const offsetLabel = (o) => {
  if (!o) return "On time";
  const s = Math.abs(o).toFixed(1).replace(/\.0$/, "");
  return `${s} s ${o > 0 ? "later" : "earlier"}`;
};
const qualityLabel = (q) => (q ? `${q.height}p` : "");

// ── Icons (simple 24px strokes) ──────────────────────────────────────────────
const Svg = ({ children, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const Icons = {
  Check: () => <Svg size={20}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  Right: () => <Svg size={18}><path d="M9 6l6 6-6 6" /></Svg>,
  Left: () => <Svg size={20}><path d="M15 6l-6 6 6 6" /></Svg>,
  Cc: () => (
    <Svg size={26}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6" />
    </Svg>
  ),
  Gear: () => (
    <Svg size={26}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  Bookmark: () => <Svg size={26}><path d="M6 3.5h12v17l-6-4-6 4z" /></Svg>,
  Speed: () => <Svg size={20}><path d="M12 13l4-4" /><path d="M3.5 17a9 9 0 1 1 17 0" /></Svg>,
  Sliders: () => <Svg size={20}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>,
  Access: () => <Svg size={20}><circle cx="12" cy="4.5" r="1.5" /><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M9 21l3-6.5 3 6.5" /></Svg>,
  Audio: () => <Svg size={20}><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></Svg>,
  Sun: () => <Svg size={20}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>,
  Moon: () => <Svg size={20}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>,
  BookmarkSm: () => <Svg size={20}><path d="M6 3.5h12v17l-6-4-6 4z" /></Svg>,
  Link: () => <Svg size={20}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></Svg>,
  Download: () => <Svg size={20}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>,
  Close: () => <Svg size={16}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
};

// ── Building blocks ──────────────────────────────────────────────────────────
function Row({ icon, label, sub, value, chevron, checked, checkCol, onClick, children }) {
  return (
    <button type="button" className="cno-row" onClick={onClick}>
      {checkCol && <span className="cno-row-check">{checked ? <Icons.Check /> : null}</span>}
      {icon && <span className="cno-row-icon">{icon}</span>}
      <span className="cno-row-main">
        <span className={"cno-row-label" + (checked ? " is-checked" : "")}>{label}</span>
        {sub && <span className="cno-row-sub">{sub}</span>}
      </span>
      {value != null && <span className="cno-row-value">{value}</span>}
      {children}
      {chevron && <span className="cno-row-chevron"><Icons.Right /></span>}
    </button>
  );
}

function Toggle({ on }) {
  return <span className={"cno-toggle" + (on ? " is-on" : "")}><span /></span>;
}

function SubHeader({ title, onBack }) {
  return (
    <button type="button" className="cno-subheader" onClick={onBack}>
      <Icons.Left />
      <span>{title}</span>
    </button>
  );
}

const Divider = () => <div className="cno-divider" />;

function Panel({ wide, children }) {
  return (
    <div className={"cno-panel" + (wide ? " is-wide" : "")} role="menu" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

// ── Subtitles panel ──────────────────────────────────────────────────────────
function SubtitlesPanel() {
  const ui = useUi();
  const [view, setView] = useState("root");
  const { groups, primary, secondary, offset, style, loading, error } = ui.subs;
  const primaryGroup = groups.find((g) => g.lang === primary?.lang);
  const back = () => setView("root");

  if (view === "all" || view === "second") {
    const isSecond = view === "second";
    const sorted = [...groups].sort((a, b) => a.label.localeCompare(b.label));
    const current = isSecond ? secondary?.lang : primary?.lang;
    return (
      <Panel wide>
        <SubHeader title={isSecond ? "Second Subtitles" : "All Languages"} onBack={back} />
        <Row checkCol label="Off" checked={!current} onClick={() => { isSecond ? ui.setSecondaryLang(null) : ui.setPrimaryLang(null); back(); }} />
        {sorted.map((g) => (
          <Row
            key={g.lang}
            checkCol
            label={g.label}
            sub={`${g.versions.length} version${g.versions.length === 1 ? "" : "s"}`}
            checked={current === g.lang}
            onClick={() => { isSecond ? ui.setSecondaryLang(g.lang) : ui.setPrimaryLang(g.lang); back(); }}
          />
        ))}
      </Panel>
    );
  }

  if (view === "version") {
    return (
      <Panel wide>
        <SubHeader title={`Version · ${primaryGroup?.label || ""}`} onBack={back} />
        {(primaryGroup?.versions || []).map((v, i) => (
          <Row
            key={v.url}
            checkCol
            label={i === 0 ? "Best match" : `Version ${i + 1}`}
            sub={[
              v.ai ? "AI translated" : null,
              v.hearingImpaired ? "SDH" : null,
              v.release || "Unknown release",
              v.downloads ? `${v.downloads.toLocaleString()} downloads` : null,
            ].filter(Boolean).join(" · ")}
            checked={primary?.url === v.url}
            onClick={() => { ui.setPrimaryVersion(v.url); back(); }}
          />
        ))}
      </Panel>
    );
  }

  if (view === "timing") {
    const step = (d) => ui.setOffset(Math.round((offset + d) * 10) / 10);
    return (
      <Panel wide>
        <SubHeader title="Timing" onBack={back} />
        <div className="cno-timing">
          <button type="button" onClick={() => step(-0.5)}>−0.5</button>
          <button type="button" onClick={() => step(-0.1)}>−0.1</button>
          <span>{offsetLabel(offset)}</span>
          <button type="button" onClick={() => step(0.1)}>+0.1</button>
          <button type="button" onClick={() => step(0.5)}>+0.5</button>
        </div>
        <p className="cno-hint">Subtitles early? Move them later. Shortcut: G / H.</p>
        <Row checkCol label="Auto (no offset)" checked={offset === 0} onClick={() => ui.setOffset(0)} />
      </Panel>
    );
  }

  if (view.startsWith("style")) {
    const key = view.split(":")[1];
    if (key) {
      return (
        <Panel wide>
          <SubHeader title={key[0].toUpperCase() + key.slice(1)} onBack={() => setView("style")} />
          {Object.keys(SUB_STYLE_OPTIONS[key]).map((name) => (
            <Row key={name} checkCol label={name} checked={style[key] === name} onClick={() => { ui.setStyle({ ...style, [key]: name }); setView("style"); }} />
          ))}
        </Panel>
      );
    }
    return (
      <Panel wide>
        <SubHeader title="Style" onBack={back} />
        {Object.keys(SUB_STYLE_OPTIONS).map((k) => (
          <Row key={k} label={k[0].toUpperCase() + k.slice(1)} value={style[k]} chevron onClick={() => setView(`style:${k}`)} />
        ))}
        <Divider />
        <Row label="Reset to default" onClick={() => ui.setStyle(DEFAULT_SUB_STYLE)} />
      </Panel>
    );
  }

  // Root: Off, the most common languages, then the deeper options.
  const quick = [...groups].sort((a, b) => b.versions.length - a.versions.length).slice(0, 4);
  if (primaryGroup && !quick.includes(primaryGroup)) quick.unshift(primaryGroup);
  const styleIsDefault = Object.keys(DEFAULT_SUB_STYLE).every((k) => style[k] === DEFAULT_SUB_STYLE[k]);
  const versionIdx = primaryGroup?.versions.findIndex((v) => v.url === primary?.url) ?? -1;
  return (
    <Panel wide>
      <div className="cno-header">
        <div className="cno-header-title">Subtitles</div>
        <div className="cno-header-sub">
          {loading ? "Loading subtitles…" : error ? error : primary ? `Synced: ${offsetLabel(offset)}` : groups.length ? `${groups.length} languages available` : "No subtitles found"}
        </div>
      </div>
      <Row checkCol label="Off" checked={!primary} onClick={() => ui.setPrimaryLang(null)} />
      {quick.map((g) => (
        <Row
          key={g.lang}
          checkCol
          label={g.label}
          sub={`${g.versions.length} version${g.versions.length === 1 ? "" : "s"}`}
          checked={primary?.lang === g.lang}
          onClick={() => ui.setPrimaryLang(g.lang)}
        />
      ))}
      {groups.length > 0 && <Row label="All Languages" value={groups.length} chevron onClick={() => setView("all")} />}
      <Divider />
      <Row label="Version" value={!primaryGroup ? "—" : versionIdx <= 0 ? "Best match" : `Version ${versionIdx + 1}`} chevron onClick={() => primaryGroup && setView("version")} />
      <Row label="Second Subtitles" value={groups.find((g) => g.lang === secondary?.lang)?.label || "Off"} chevron onClick={() => setView("second")} />
      <Row label="Timing" value={offset ? offsetLabel(offset) : "Auto"} chevron onClick={() => setView("timing")} />
      <Row label="Style" value={styleIsDefault ? "Default" : "Custom"} chevron onClick={() => setView("style")} />
    </Panel>
  );
}

// ── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel() {
  const ui = useUi();
  const player = useMediaPlayer();
  const rate = useMediaState("playbackRate");
  const qualities = useMediaState("qualities");
  const quality = useMediaState("quality");
  const autoQuality = useMediaState("autoQuality");
  const audioTracks = useMediaState("audioTracks");
  const audioTrack = useMediaState("audioTrack");
  const canSetAudioGain = useMediaState("canSetAudioGain");
  const currentTime = useMediaState("currentTime");
  const [view, setView] = useState("root");
  const back = () => setView("root");
  const s = ui.settings;

  if (view === "speed") {
    return (
      <Panel>
        <SubHeader title="Speed" onBack={back} />
        {SPEEDS.map((r) => (
          <Row key={r} checkCol label={speedLabel(r)} checked={rate === r} onClick={() => { player.playbackRate = r; back(); }} />
        ))}
      </Panel>
    );
  }

  if (view === "quality") {
    const sorted = [...qualities].sort((a, b) => b.height - a.height);
    return (
      <Panel>
        <SubHeader title="Quality" onBack={back} />
        <Row checkCol label="Auto" sub={autoQuality && quality ? `Currently ${qualityLabel(quality)}` : null} checked={autoQuality} onClick={() => { player.qualities.autoSelect(); back(); }} />
        {sorted.map((q) => (
          <Row key={q.id} checkCol label={qualityLabel(q)} sub={q.height >= 2160 ? "4K" : q.height >= 1080 ? "HD" : null} checked={!autoQuality && quality?.id === q.id} onClick={() => { q.selected = true; back(); }} />
        ))}
      </Panel>
    );
  }

  if (view === "accessibility") {
    return (
      <Panel>
        <SubHeader title="Accessibility" onBack={back} />
        <Row label="Keyboard animations" onClick={() => ui.setSetting("keyboardAnims", !s.keyboardAnims)}><Toggle on={s.keyboardAnims} /></Row>
        <Row label="High-contrast subtitles" onClick={() => ui.setSetting("highContrast", !s.highContrast)}><Toggle on={s.highContrast} /></Row>
      </Panel>
    );
  }

  if (view === "audio") {
    return (
      <Panel>
        <SubHeader title="Audio" onBack={back} />
        {audioTracks.length > 1 && audioTracks.map((t) => (
          <Row key={t.id} checkCol label={t.label || t.language || "Track"} checked={audioTrack?.id === t.id} onClick={() => { t.selected = true; }} />
        ))}
        {audioTracks.length <= 1 && <Row checkCol checked label={audioTracks[0]?.label || "Default track"} />}
        {canSetAudioGain && (
          <>
            <Divider />
            <div className="cno-section-label">Volume boost</div>
            {BOOST_OPTIONS.map((g) => (
              <Row key={g} checkCol label={g === 1 ? "Off" : `${g}×`} checked={s.boost === g} onClick={() => ui.setSetting("boost", g)} />
            ))}
          </>
        )}
      </Panel>
    );
  }

  if (view === "picture") {
    return (
      <Panel>
        <SubHeader title="Picture" onBack={back} />
        {Object.keys(PICTURE_MODES).map((m) => (
          <Row key={m} checkCol label={m} checked={s.picture === m} onClick={() => { ui.setSetting("picture", m); back(); }} />
        ))}
      </Panel>
    );
  }

  if (view === "sleep") {
    return (
      <Panel>
        <SubHeader title="Sleep Timer" onBack={back} />
        {SLEEP_OPTIONS.map((o) => (
          <Row key={String(o)} checkCol label={sleepLabel(o)} checked={s.sleep === o} onClick={() => { ui.setSleep(o); back(); }} />
        ))}
      </Panel>
    );
  }

  if (view === "moments") {
    return (
      <Panel>
        <SubHeader title="Moments" onBack={back} />
        <Row icon={<Icons.BookmarkSm />} label="Save this moment" value={formatTime(currentTime)} onClick={() => ui.addMoment()} />
        {ui.moments.length > 0 && <Divider />}
        {ui.moments.map((m) => (
          <Row key={m.t} label={formatTime(m.t)} sub={m.label} onClick={() => { player.currentTime = m.t; ui.closeMenu(); }}>
            <span
              className="cno-row-remove"
              role="button"
              aria-label="Remove moment"
              onClick={(e) => { e.stopPropagation(); ui.removeMoment(m.t); }}
            >
              <Icons.Close />
            </span>
          </Row>
        ))}
      </Panel>
    );
  }

  return (
    <Panel>
      <Row label="Crop Black Bars" onClick={() => ui.setSetting("crop", !s.crop)}><Toggle on={s.crop} /></Row>
      <Row icon={<Icons.Speed />} label="Speed" value={speedLabel(rate)} chevron onClick={() => setView("speed")} />
      <Row icon={<Icons.Sliders />} label="Quality" value={autoQuality ? "Auto" : qualityLabel(quality)} chevron onClick={() => setView("quality")} />
      <Row icon={<Icons.Access />} label="Accessibility" chevron onClick={() => setView("accessibility")} />
      <Row icon={<Icons.Audio />} label="Audio" chevron onClick={() => setView("audio")} />
      <Row icon={<Icons.Sun />} label="Picture" value={s.picture} chevron onClick={() => setView("picture")} />
      <Row icon={<Icons.Moon />} label="Sleep Timer" value={ui.sleepRemaining || sleepLabel(s.sleep)} chevron onClick={() => setView("sleep")} />
      <Row icon={<Icons.BookmarkSm />} label="Moments" value={ui.moments.length} chevron onClick={() => setView("moments")} />
      <Row icon={<Icons.Link />} label="Copy Link to This Moment" onClick={() => { ui.copyLink(); ui.closeMenu(); }} />
      {ui.onDownload && <Row icon={<Icons.Download />} label="Download…" onClick={() => ui.download()} />}
    </Panel>
  );
}

// ── Control-bar buttons (rendered in DefaultVideoLayout slots) ───────────────
export function CcButton() {
  const ui = useUi();
  const on = !!ui.subs.primary;
  return (
    <button
      type="button"
      className={"vds-button cno-bar-btn" + (ui.openMenu === "subs" ? " is-open" : "")}
      aria-label="Subtitles"
      aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); ui.toggleMenu("subs"); }}
    >
      <Icons.Cc />
      {on && <span className="cno-cc-dot" />}
    </button>
  );
}

export function MomentButton() {
  const ui = useUi();
  return (
    <button type="button" className="vds-button cno-bar-btn" aria-label="Save this moment" onClick={(e) => { e.stopPropagation(); ui.addMoment(); }}>
      <Icons.Bookmark />
    </button>
  );
}

export function SettingsButton() {
  const ui = useUi();
  return (
    <button
      type="button"
      className={"vds-button cno-bar-btn" + (ui.openMenu === "settings" ? " is-open" : "")}
      aria-label="Settings"
      onClick={(e) => { e.stopPropagation(); ui.toggleMenu("settings"); }}
    >
      <Icons.Gear />
    </button>
  );
}

// ── Overlays rendered inside <MediaPlayer> ───────────────────────────────────
export function CnoMenuLayer() {
  const ui = useUi();
  useEffect(() => {
    if (!ui.openMenu) return;
    const onKey = (e) => { if (e.key === "Escape") ui.closeMenu(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.openMenu]);
  if (!ui.openMenu) return null;
  return (
    <div className="cno-menu-layer" onClick={() => ui.closeMenu()}>
      {ui.openMenu === "subs" ? <SubtitlesPanel /> : <SettingsPanel />}
    </div>
  );
}

export function SubtitleOverlay() {
  const ui = useUi();
  const currentTime = useMediaState("currentTime");
  const controlsVisible = useMediaState("controlsVisible");
  const { primaryCues, secondaryCues, offset, style } = ui.subs;
  const top = activeCueText(primaryCues, currentTime, offset);
  const bottom = activeCueText(secondaryCues, currentTime, offset);
  if (!top && !bottom) return null;
  const hc = ui.settings.highContrast;
  const bg = hc ? "solid" : SUB_STYLE_OPTIONS.background[style.background];
  const cls = `cno-subs bg-${bg} font-${SUB_STYLE_OPTIONS.font[style.font]}` + (controlsVisible ? " is-raised" : "");
  return (
    <div
      className={cls}
      style={{
        "--cno-sub-scale": SUB_STYLE_OPTIONS.size[style.size],
        "--cno-sub-color": hc ? "#ffff00" : SUB_STYLE_OPTIONS.color[style.color],
      }}
    >
      {top && <div className="cno-sub-line">{top}</div>}
      {bottom && <div className="cno-sub-line is-second">{bottom}</div>}
    </div>
  );
}

export function CnoToast() {
  const ui = useUi();
  if (!ui.toast) return null;
  return <div className="cno-toast">{ui.toast}</div>;
}
