// ToolCuts backend (runs on txiki.js). The page does all the work; the only
// thing it needs from here is to learn when a tool window was closed.

export const api = {};

// info is an id or { id }; handle both
export function onWindowClosed(info, app) {
  app.push('tool-closed', typeof info === 'object' ? (info.id ?? info.window) : info);
}
