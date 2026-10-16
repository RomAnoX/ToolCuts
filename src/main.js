// ToolCuts backend (runs on txiki.js). The page does the work; the backend only
// closes tool windows on request and reports when one was closed.

export const api = {
  // close a tool window from the board (the page can only close its own window)
  closeWindow: async ({ id }, app) => { app.window(id).close(); },
};

// info is an id or { id }; handle both
export function onWindowClosed(info, app) {
  app.push('tool-closed', typeof info === 'object' ? (info.id ?? info.window) : info);
}
