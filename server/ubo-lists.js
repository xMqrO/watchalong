// Shared ad-block filter-list sources.
// Single source of truth used by both the server-side uBO engine
// (server/ubo.js, Node-native) and the browser service worker
// (src/utils/ubo/sw-entry.js, bundled with shims).

export const UBO_LISTS = [
  {
    id: "easylist",
    title: "EasyList",
    url: "https://easylist.to/easylist/easylist.txt",
  },
  {
    id: "easyprivacy",
    title: "EasyPrivacy",
    url: "https://easylist.to/easylist/easyprivacy.txt",
  },
  {
    id: "ublock-filters",
    title: "uBlock Origin Filters",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt",
  },
  {
    id: "ublock-privacy",
    title: "uBlock Origin Privacy",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt",
  },
  {
    id: "ublock-unbreak",
    title: "uBlock Unbreak",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt",
  },
  {
    id: "ublock-badware",
    title: "uBlock Badware risks",
    url: "https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt",
  },
  {
    id: "urlhaus",
    title: "URLhaus Malicious URLs",
    url: "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-agh-online.txt",
  },
  {
    id: "brave-unbreak",
    title: "Brave Unbreak",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-unbreak.txt",
  },
  {
    id: "brave-specific",
    title: "Brave Specific",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-specific.txt",
  },
  {
    id: "brave-social",
    title: "Brave Social",
    url: "https://raw.githubusercontent.com/brave/adblock-lists/master/brave-lists/brave-social.txt",
  },
  {
    id: "cookie-notice",
    title: "Cookie Notice Blocker",
    url: "https://secure.fanboy.co.nz/fanboy-cookiemonster_ubo.txt",
  },
  {
    id: "social-mobile",
    title: "Social Media Blocker",
    url: "https://easylist-downloads.adblockplus.org/fanboy-social.txt",
  },
];