// Sidebar icon set, drawn as one family on a 24px grid: 1.75px strokes,
// round caps and joins, 2px corner radii. Pages that are "places" (Home,
// Library, Downloads) get a filled variant used for the current page, so
// the active item reads by shape as well as by colour.

const Svg = ({ children, size = 22 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    shapeRendering="geometricPrecision"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

export const NavHomeIcon = ({ filled }) => (
  <Svg>
    <path
      d="M4 10.2 11.35 4.3a1 1 0 0 1 1.3 0L20 10.2V19a1 1 0 0 1-1 1h-4.25v-5.25a.75.75 0 0 0-.75-.75h-4a.75.75 0 0 0-.75.75V20H5a1 1 0 0 1-1-1z"
      fill={filled ? "currentColor" : "none"}
    />
  </Svg>
);

export const NavSearchIcon = () => (
  <Svg>
    <circle cx="10.75" cy="10.75" r="6.25" />
    <path d="m15.5 15.5 4.5 4.5" />
  </Svg>
);

// A stack of posters: your saved titles and history.
export const NavLibraryIcon = ({ filled }) => (
  <Svg>
    <path d="M5 7.5V18a2 2 0 0 0 2 2h8.5" />
    <rect
      x="8.5"
      y="3.75"
      width="11"
      height="13.5"
      rx="2"
      fill={filled ? "currentColor" : "none"}
    />
  </Svg>
);

export const NavDownloadsIcon = ({ filled }) => (
  <Svg>
    <path d="M12 4v9.5" />
    <path d="m7.75 9.75 4.25 4.25 4.25-4.25" />
    <path
      d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5"
      fill={filled ? "currentColor" : "none"}
    />
  </Svg>
);

export const NavHelpIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M9.6 9.6a2.45 2.45 0 1 1 3.4 2.25c-.6.26-1 .82-1 1.48v.4" />
    <circle cx="12" cy="16.6" r="0.4" fill="currentColor" />
  </Svg>
);

// Sliders read as "adjust" and stay crisp at small sizes, unlike a gear.
export const NavSettingsIcon = ({ filled }) => (
  <Svg>
    <path d="M4 7h8.5M17.5 7H20M4 12h2.5M11.5 12H20M4 17h10.5M19.5 17h.5" />
    <circle cx="15" cy="7" r="2.25" fill={filled ? "currentColor" : "none"} />
    <circle cx="9" cy="12" r="2.25" fill={filled ? "currentColor" : "none"} />
    <circle cx="17" cy="17" r="2.25" fill={filled ? "currentColor" : "none"} />
  </Svg>
);

export const NavBackIcon = () => (
  <Svg>
    <path d="M14.5 6 8.5 12l6 6" />
  </Svg>
);

export const NavQuitIcon = () => (
  <Svg>
    <path d="M12 4v7" />
    <path d="M7.05 6.9a7 7 0 1 0 9.9 0" />
  </Svg>
);

// Panel with its first column: filled = sidebar kept open.
export const NavPanelIcon = ({ filled }) => (
  <Svg>
    <rect x="3.75" y="4.75" width="16.5" height="14.5" rx="2" />
    <path d="M9.5 4.75v14.5" />
    {filled && (
      <path
        d="M9.5 4.75H5.75a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2H9.5z"
        fill="currentColor"
        stroke="none"
      />
    )}
  </Svg>
);

export const NavFilmIcon = () => (
  <Svg size={16}>
    <rect x="4" y="3.75" width="16" height="16.5" rx="2" />
    <path d="M8 3.75v16.5M16 3.75v16.5M4 12h16" />
  </Svg>
);
